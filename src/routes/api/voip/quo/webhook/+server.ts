/**
 * Quo (OpenPhone) event webhook.
 *
 * POST /api/voip/quo/webhook
 *
 * Quo POSTs here on call status changes. Register this URL in
 * Quo Settings → Webhooks. This endpoint is UNAUTHENTICATED (Quo calls it
 * directly), so a valid HMAC signature is REQUIRED — same fail-closed pattern
 * as the Resend inbound route (api/emails/inbound):
 *   - bad signature                → 401
 *   - QUO_WEBHOOK_SECRET unset in production → 503
 *   - QUO_WEBHOOK_SECRET unset in dev        → warn + accept (dev only)
 *
 * On `call.completed`:
 *   1. Resolve the OWNER (which platform account owns the receiving line).
 *   2. Match the counterparty phone number to a contact for that owner.
 *   3. Upsert into public.calls (provider='quo', provider_call_id, ...).
 *   4. Fire transcribeQuoCall() fire-and-forget if a recording exists.
 *   5. Return 200 quickly.
 */

import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';
import {
	verifyQuoSignature,
	quoWebhookSecret,
	quoPhoneNumberId,
	transcribeQuoCall,
	upsertQuoCall,
	type QuoCall,
} from '$lib/server/quo';

/**
 * Resolve the platform owner (user_id) that owns the Quo line a call came in on.
 *
 * ASSUMPTION / mapping order:
 *   1. A phone_numbers row whose twilio_phone_sid == QUO_PHONE_NUMBER_ID
 *      (we reuse that column as the provider line-id — no schema change).
 *   2. Else the first user that has ANY calls (the single configured account).
 *   3. Else null (nothing to attribute the call to → we skip, not crash).
 *
 * This is deliberately conservative for a single-configured-account setup. When
 * multiple tenants each bring their own Quo number, extend step 1 to key on a
 * dedicated provider column instead of reusing twilio_phone_sid.
 */
async function resolveQuoOwner(): Promise<string | null> {
	const phoneNumberId = quoPhoneNumberId();

	if (phoneNumberId) {
		const { data: pn } = await supabaseAdmin
			.from('phone_numbers')
			.select('user_id')
			.eq('twilio_phone_sid', phoneNumberId)
			.limit(1)
			.maybeSingle();
		if (pn?.user_id) return pn.user_id;
	}

	// Fallback: the account that already owns calls (single-tenant configured line).
	const { data: anyCall } = await supabaseAdmin
		.from('calls')
		.select('user_id')
		.order('created_at', { ascending: true })
		.limit(1)
		.maybeSingle();
	return anyCall?.user_id ?? null;
}

export const POST = async ({ request }) => {
	const rawBody = await request.text();
	const sigHeader = request.headers.get('openphone-signature') ?? '';

	// ── Fail-closed signature check (mirrors api/emails/inbound) ──────────────
	const secret = quoWebhookSecret();
	if (!secret) {
		if (process.env.NODE_ENV === 'production') {
			console.error('[quo/webhook] QUO_WEBHOOK_SECRET not set — rejecting unverified webhook');
			return json({ error: 'Webhook secret not configured' }, { status: 503 });
		}
		console.warn('[quo/webhook] QUO_WEBHOOK_SECRET not set — skipping signature verification (dev only)');
	} else if (!verifyQuoSignature(rawBody, sigHeader)) {
		return json({ error: 'Invalid signature' }, { status: 401 });
	}

	// ── Parse ─────────────────────────────────────────────────────────────────
	let payload: { type?: string; data?: { object?: QuoCall } };
	try {
		payload = JSON.parse(rawBody);
	} catch {
		return json({ error: 'Invalid payload' }, { status: 400 });
	}

	const eventType = payload.type ?? '';
	const callObject = payload.data?.object;

	// We only act on completed calls; ack everything else quickly so Quo doesn't retry.
	if (eventType !== 'call.completed' || !callObject?.id) {
		return json({ received: true, event: eventType });
	}

	const ownerId = await resolveQuoOwner();
	if (!ownerId) {
		console.warn('[quo/webhook] no owner could be resolved for the Quo line — skipping');
		return json({ received: true, routed: false });
	}

	const { rowId, recordingUrl, hasTranscript } = await upsertQuoCall(ownerId, callObject);

	// Fire-and-forget transcription (never block the webhook ack).
	if (rowId && recordingUrl && !hasTranscript) {
		void transcribeQuoCall(rowId, recordingUrl, ownerId).catch((err) =>
			console.error('[quo/webhook] transcription error:', err instanceof Error ? err.message : err),
		);
	}

	return json({ received: true, event: eventType, callId: rowId });
};
