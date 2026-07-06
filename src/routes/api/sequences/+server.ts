import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { data } = await supabaseAdmin.from('email_sequences').select('*, steps:sequence_steps(*)').eq('user_id', ownerId).order('created_at', { ascending: false });
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { name, description, triggerType, steps } = await request.json();
	if (!name?.trim()) throw error(400, 'name required');

	// Per-channel validation (no DB CHECK constraint — validated here by design).
	const CHANNELS = ['email', 'sms', 'call_task'];
	for (const [i, s] of ((steps ?? []) as Record<string, unknown>[]).entries()) {
		const channel = typeof s.channel === 'string' && CHANNELS.includes(s.channel) ? s.channel : 'email';
		if (channel === 'email' && (!s.subject || !s.body)) throw error(400, `Step ${i + 1}: email steps need a subject and body`);
		if (channel === 'sms' && !(typeof s.sms_body === 'string' && s.sms_body.trim())) throw error(400, `Step ${i + 1}: SMS steps need a message body`);
	}

	const { data: seq, error: e } = await supabaseAdmin.from('email_sequences').insert({ user_id: ownerId, name: name.trim(), description, trigger_type: triggerType ?? 'manual' }).select().single();
	if (e) throw error(400, e.message);

	if (steps?.length) {
		// Column mapping matches the sequence_steps schema (0000_baseline + 0008_sequence_channels).
		// subject/body are NOT NULL — non-email channels store '' there and use sms_body / nothing.
		const { error: stepErr } = await supabaseAdmin.from('sequence_steps').insert(
			steps.map((s: Record<string, unknown>, i: number) => {
				const channel = typeof s.channel === 'string' && CHANNELS.includes(s.channel) ? s.channel : 'email';
				return {
					sequence_id: seq.id,
					step_number: i + 1,
					channel,
					delay_days:  Number(s.delay_days) || 0,
					delay_hours: Number(s.delay_hours) || 0,
					subject:     channel === 'email' ? String(s.subject ?? '') : '',
					body:        channel === 'email' ? String(s.body ?? '') : '',
					email_type:  (s.email_type as string) ?? 'follow_up',
					sms_body:    channel === 'sms' ? String(s.sms_body ?? '').trim() : null,
				};
			})
		);
		if (stepErr) {
			// Don't leave an empty sequence behind if the steps failed to persist.
			await supabaseAdmin.from('email_sequences').delete().eq('id', seq.id).eq('user_id', ownerId);
			throw error(400, stepErr.message);
		}
	}
	const { data: full } = await supabaseAdmin.from('email_sequences').select('*, steps:sequence_steps(*)').eq('id', seq.id).eq('user_id', ownerId).single();
	return json(full ?? seq);
};
