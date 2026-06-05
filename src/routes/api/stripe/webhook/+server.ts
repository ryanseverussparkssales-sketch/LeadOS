import { json, error } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';
import crypto from 'node:crypto';
import type { RequestHandler } from './$types';

/**
 * Stripe webhook. Without the `stripe` SDK we verify the signature manually:
 * header `Stripe-Signature: t=<ts>,v1=<hex>[,v1=...]`, where
 *   v1 = HMAC-SHA256(secret = STRIPE_WEBHOOK_SECRET, message = `${t}.${rawBody}`).
 *
 * Primary purpose: flip team_members.stripe_connect_status → 'active' once a rep
 * finishes Connect onboarding (account.updated). Without this, payouts stay blocked
 * because /api/payouts requires status === 'active'.
 */
function verifyStripeSignature(payload: string, header: string | null, secret: string): boolean {
	if (!header) return false;
	const items = header.split(',').map((p) => p.split('='));
	const t = items.find(([k]) => k === 't')?.[1];
	const sigs = items.filter(([k]) => k === 'v1').map(([, v]) => v);
	if (!t || sigs.length === 0) return false;

	const expected = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
	const expectedBuf = Buffer.from(expected);
	return sigs.some((sig) => {
		const sigBuf = Buffer.from(sig);
		return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
	});
}

export const POST: RequestHandler = async ({ request }) => {
	const secret = env.STRIPE_WEBHOOK_SECRET;
	if (!secret) {
		console.error('[stripe/webhook] STRIPE_WEBHOOK_SECRET not configured');
		throw error(503, 'Webhook not configured');
	}

	const payload = await request.text(); // raw body required for signature
	if (!verifyStripeSignature(payload, request.headers.get('stripe-signature'), secret)) {
		console.error('[stripe/webhook] signature verification failed');
		throw error(403, 'Invalid signature');
	}

	let evt: { type: string; data: { object: Record<string, any> } };
	try {
		evt = JSON.parse(payload);
	} catch {
		throw error(400, 'Invalid JSON');
	}

	if (evt.type === 'account.updated') {
		const acct = evt.data.object;
		const accountId = acct.id as string;
		const ready = acct.capabilities?.transfers === 'active' || acct.payouts_enabled === true;
		const status = ready ? 'active' : 'pending';

		const { error: e } = await supabaseAdmin
			.from('team_members')
			.update({ stripe_connect_status: status })
			.eq('stripe_connect_account_id', accountId);

		if (e) console.error('[stripe/webhook] status update failed:', e.message);
		else console.log(`[stripe/webhook] account ${accountId} → ${status}`);
	}

	return json({ received: true });
};
