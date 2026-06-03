import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/server/supabase';
import { decodeReplyTag, isReplyRoutingAddress, type ReplyContext } from '$lib/server/replyTag';

// Resend webhook signature verification using svix HMAC-SHA256
async function verifyResendWebhookSignature(
	svixId: string,
	svixTimestamp: string,
	svixSignature: string,
	rawBody: string,
	webhookSecret: string
): Promise<boolean> {
	try {
		const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
		const secretBytes = Uint8Array.from(
			atob(webhookSecret.replace(/^whsec_/, '')),
			c => c.charCodeAt(0)
		);
		const key = await crypto.subtle.importKey(
			'raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
		);
		const signature = await crypto.subtle.sign(
			'HMAC', key, new TextEncoder().encode(signedContent)
		);
		const expectedSig = 'v1,' + btoa(String.fromCharCode(...new Uint8Array(signature)));
		const receivedSigs = svixSignature.split(' ');
		return receivedSigs.some(sig => sig === expectedSig);
	} catch (e) {
		console.error('[email/inbound] signature verification error:', e);
		return false;
	}
}

function normalizeThreadKey(subject: string): string {
	return subject
		.replace(/^(Re:|Fwd:|RE:|FWD:|Fw:)\s*/gi, '')
		.trim()
		.toLowerCase()
		.replace(/\s+/g, ' ');
}

function extractEmail(address: string): string {
	const match = address.match(/<([^>]+)>/) ?? address.match(/([^\s,]+@[^\s,]+)/);
	return (match?.[1] ?? address).toLowerCase().trim();
}

function extractName(address: string): string | null {
	const match = address.match(/^([^<]+)</) ?? address.match(/^([^@\s]+)/);
	return match?.[1]?.trim().replace(/['"]/g, '') || null;
}

export const POST = async ({ request }) => {
	// ── Signature verification ────────────────────────────────
	const webhookSecret = env.RESEND_WEBHOOK_SECRET ?? '';
	let body: any;

	if (webhookSecret) {
		const svixId = request.headers.get('svix-id');
		const svixTimestamp = request.headers.get('svix-timestamp');
		const svixSignature = request.headers.get('svix-signature');

		if (!svixId || !svixTimestamp || !svixSignature) {
			return json({ error: 'Missing svix headers' }, { status: 401 });
		}

		const rawBody = await request.text();

		const isValid = await verifyResendWebhookSignature(
			svixId, svixTimestamp, svixSignature, rawBody, webhookSecret
		);

		if (!isValid) {
			return json({ error: 'Invalid signature' }, { status: 401 });
		}

		try {
			body = JSON.parse(rawBody);
		} catch {
			return json({ error: 'Invalid payload' }, { status: 400 });
		}
	} else {
		// No secret configured — log warning and continue (dev mode)
		console.warn('[email/inbound] RESEND_WEBHOOK_SECRET not set — skipping signature verification');
		body = await request.json().catch(() => null);
		if (!body) return json({ error: 'Invalid payload' }, { status: 400 });
	}

	const fromAddress = extractEmail(body.from ?? '');
	const _fromName = extractName(body.from ?? '');
	const toAddresses: string[] = (Array.isArray(body.to) ? body.to : [body.to]).map(extractEmail);
	const subject = body.subject ?? '(no subject)';
	const textBody = body.text ?? '';
	const htmlBody = body.html ?? '';
	const messageId = body.headers?.['message-id'] ?? body.message_id ?? null;
	const inReplyTo = body.headers?.['in-reply-to'] ?? null;
	const resendEmailId = body.email_id ?? null;

	if (!fromAddress) return json({ error: 'No from address' }, { status: 400 });

	// ── 0. Check for reply-routing tag in To/CC addresses ────────────────────
	const inboundDomain = env.RESEND_INBOUND_DOMAIN ?? env.PUBLIC_REPLY_DOMAIN ?? '';

	let replyContext: ReplyContext | null = null;
	let replyTag: string | null = null;

	// Collect raw (un-extracted) To + CC addresses to check for +subaddress tags
	const rawToAddresses: string[] = Array.isArray(body.to) ? body.to : [body.to ?? ''];
	const rawCcAddresses: string[] = Array.isArray(body.cc) ? body.cc : (body.cc ? [body.cc] : []);
	const allRawAddresses = [...rawToAddresses, ...rawCcAddresses].filter(Boolean);

	for (const addr of allRawAddresses) {
		if (inboundDomain && isReplyRoutingAddress(addr, inboundDomain)) {
			replyContext = decodeReplyTag(addr);
			replyTag = addr;
			break;
		}
	}

	// ── 1. Find which user owns the destination email address ──
	// Our email accounts are in the email_accounts table
	let ownerId: string | null = null;
	let _emailAccountId: string | null = null;

	// If we decoded a reply context, prefer the uid from the tag — it's reliable
	// even if the "to" address is our routing alias rather than a real account.
	if (replyContext?.uid) {
		ownerId = replyContext.uid;
	} else {
		for (const toAddr of toAddresses) {
			const { data: emailAccount } = await supabaseAdmin
				.from('email_accounts')
				.select('id, user_id')
				.ilike('email', toAddr)
				.single();

			if (emailAccount) {
				ownerId = emailAccount.user_id;
				_emailAccountId = emailAccount.id;
				break;
			}
		}
	}

	if (!ownerId) {
		console.warn('[email/inbound] no matching email account for:', toAddresses, 'replyContext:', replyContext);
		return json({ received: true, routed: false });
	}

	// ── 2. Match from_address to a contact ───────────────────
	const normalizedEmail = fromAddress.toLowerCase().trim();

	const { data: contact } = await supabaseAdmin
		.from('contacts')
		.select('id, name, company, contact_type, user_id')
		.eq('user_id', ownerId)
		.ilike('email', normalizedEmail)
		.is('deleted_at', null)
		.single();

	// If no contact, try to find by email_normalized column if it exists
	let contactId = contact?.id ?? null;

	if (!contactId) {
		const { data: byNormalized } = await supabaseAdmin
			.from('contacts')
			.select('id, name, company, contact_type')
			.eq('user_id', ownerId)
			.eq('email_normalized', normalizedEmail)
			.is('deleted_at', null)
			.single();
		contactId = byNormalized?.id ?? null;
	}

	// ── 3. Upsert email thread ────────────────────────────────
	const threadKey = normalizeThreadKey(subject);
	const snippet = textBody.slice(0, 200).replace(/\n/g, ' ').trim();

	const { data: thread } = await supabaseAdmin
		.from('email_threads')
		.upsert(
			{
				user_id: ownerId,
				contact_id: contactId,
				subject: subject.replace(/^(Re:|Fwd:|RE:|FWD:|Fw:)\s*/gi, '').trim(),
				thread_key: threadKey,
				last_message_at: new Date().toISOString(),
				last_message_body: snippet,
				last_message_direction: 'inbound',
				// Link thread to campaign if we decoded reply context
				...(replyContext?.cid ? { campaign_id: replyContext.cid } : {}),
			},
			{ onConflict: 'user_id,thread_key,contact_id' }
		)
		.select()
		.single();

	if (thread) {
		await supabaseAdmin
			.from('email_threads')
			.update({
				unread_count: (thread.unread_count ?? 0) + 1,
				message_count: (thread.message_count ?? 0) + 1
			})
			.eq('id', thread.id);
	}

	// ── 4. Insert email_logs row ──────────────────────────────
	const { data: emailLog, error: logError } = await supabaseAdmin
		.from('email_logs')
		.insert({
			user_id: ownerId,
			contact_id: contactId,
			subject,
			body: textBody,
			html_body: htmlBody,
			from_address: fromAddr ?? null,
			to_address: toAddr ?? null,
			sent_at: new Date().toISOString(),
			direction: 'inbound',
		});

	return new Response('', { status: 200 });
};
