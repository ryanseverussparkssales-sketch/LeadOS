import { supabaseAdmin, normalizePhone } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// ── Intent classification (fire-and-forget) ──────────────────────────────────
async function classifyIntent(smsLogId: string, messageBody: string, contact: { id?: string; name?: string; contact_type?: string; user_id?: string } | null) {
	const { default: Anthropic } = await import('@anthropic-ai/sdk');
	const { env } = await import('$env/dynamic/private');
	const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

	const res = await anthropic.messages.create({
		model: 'claude-haiku-4-5-20251001',
		max_tokens: 100,
		messages: [{
			role: 'user',
			content: `Classify this inbound SMS reply from a sales prospect. Return JSON only.

Message: "${messageBody.slice(0, 500)}"
${contact ? `Contact type: ${contact.contact_type}` : 'Unknown contact'}

Return: {"intent": "<one of: interested|objection|opt_out|question|callback_request|referral|positive_reply|neutral>", "confidence": <0.0-1.0>, "hot": <true if this needs immediate attention>}`
		}]
	});

	const text = res.content[0].type === 'text' ? res.content[0].text : '';
	try {
		const clean = text.replace(/```json?\n?/gi, '').replace(/```
		const parsed = JSON.parse(clean);

		// Update the SMS log with intent classification
		if (parsed.intent) {
			await supabaseAdmin.from('sms_logs').update({
				intent: parsed.intent,
				intent_confidence: parsed.confidence,
				is_hot: parsed.hot ?? false,
			}).eq('id', smsLogId);
		}

		// Hot signal → bump contact to front of their call lists
		// If someone replies "interested" or "callback_request", they should dial next
		const HOT_INTENTS = new Set(['interested', 'callback_request', 'positive_reply', 'referral']);
		if (parsed.hot && contact?.id && HOT_INTENTS.has(parsed.intent)) {
			// Find all pending call_list_contacts for this contact and push to front
			const { data: entries } = await supabaseAdmin
				.from('call_list_contacts')
				.select('id, call_list_id, queue_position')
				.eq('contact_id', contact.id)
				.eq('status', 'pending');

			if (entries?.length) {
				for (const entry of entries) {
					// Get current minimum position in this list
					const { data: minRow } = await supabaseAdmin
						.from('call_list_contacts')
						.select('queue_position')
						.eq('call_list_id', entry.call_list_id)
						.eq('status', 'pending')
						.order('queue_position', { ascending: true })
						.limit(1)
						.maybeSingle();

					const frontPos = (minRow?.queue_position ?? 1) - 1;
					await supabaseAdmin
						.from('call_list_contacts')
						.update({ queue_position: frontPos })
						.eq('id', entry.id);
				}

				// Also create a task so the rep knows to prioritize this contact
				if (contact.user_id) {
					await supabaseAdmin.from('tasks').insert({
						user_id: contact.user_id,
						contact_id: contact.id,
						title: `Hot SMS reply — ${contact.name ?? 'Contact'} responded: ${parsed.intent.replace(/_/g, ' ')}`,
						task_type: 'callback',
						priority: 'high',
						status: 'pending',
						notes: `Moved to front of call queue. SMS intent: ${parsed.intent} (${Math.round((parsed.confidence ?? 0) * 100)}% confidence)`,
						due_date: new Date(Date.now() + 2 * 3600_000).toISOString(),
					}).catch(() => {});
				}
			}
		}
	} catch (e) {
		console.error('[sms/incoming] intent classification error:', e);
	}
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const form = await request.formData();
		const from    = form.get('From') as string;
		const to      = form.get('To') as string;
		const body    = form.get('Body') as string ?? '';
		const smsSid  = form.get('SmsSid') as string;

		if (!from) return new Response('', { status: 200 });
		const fromNorm = from.replace(/\D/g, '');

		// Find the phone number record to get owner
		const { data: phoneRec } = await supabaseAdmin
			.from('phone_numbers')
			.select('id, user_id')
			.or(`phone_number.eq.${to},phone_normalized.eq.${to.replace(/\D/g, '')}`)
			.eq('status', 'active')
			.maybeSingle();

		if (!phoneRec) return new Response('', { status: 200 });

		// Match to a contact
		const { data: contact } = await supabaseAdmin
			.from('contacts')
			.select('id, name, contact_type, user_id')
			.eq('user_id', phoneRec.user_id)
			.eq('phone_normalized', fromNorm)
			.maybeSingle();

		// Find or create SMS thread
		const { data: existingThread } = await supabaseAdmin
			.from('sms_threads')
			.select('id')
			.eq('user_id', phoneRec.user_id)
			.eq('contact_phone', from)
			.maybeSingle();

		const threadId = existingThread?.id ?? (await supabaseAdmin.from('sms_threads').insert({
			user_id: phoneRec.user_id,
			contact_id: contact?.id ?? null,
			contact_phone: from,
			contact_name: contact?.name ?? from,
			last_message: body.slice(0, 100),
			last_message_at: new Date().toISOString(),
			direction: 'inbound',
			unread: true,
		}).select('id').single().then(r => r.data?.id));

		// Log the message
		const { data: smsLog } = await supabaseAdmin.from('sms_logs').insert({
			thread_id: threadId,
			user_id: phoneRec.user_id,
			contact_id: contact?.id ?? null,
			direction: 'inbound',
			from_number: from,
			to_number: to,
			body,
			twilio_sid: smsSid,
			sent_at: new Date().toISOString(),
		}).select('id').single();

		// Update thread last message
		if (threadId) {
			await supabaseAdmin.from('sms_threads').update({
				last_message: body.slice(0, 100),
				last_message_at: new Date().toISOString(),
				unread: true,
			}).eq('id', threadId);
		}

		// Fire-and-forget intent classification + queue prioritization
		if (smsLog?.id) {
			classifyIntent(smsLog.id, body, contact ? { ...contact, user_id: phoneRec.user_id } : null)
				.catch(() => {});
		}

		return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
			headers: { 'Content-Type': 'application/xml' },
		});
	} catch (err) {
		console.error('[sms/incoming] error:', err);
		return new Response('', { status: 200 });
	}
};
