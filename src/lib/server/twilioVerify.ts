import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import twilio from 'twilio';

/**
 * Verify an incoming Twilio webhook signature.
 *
 * Twilio signs each request with HMAC-SHA1 over the exact public URL it called
 * plus the (sorted) POST params, using your account's AUTH_TOKEN. We rebuild a
 * few URL candidates because behind Vercel's proxy the reconstructed URL can
 * differ in protocol/host from what Twilio actually requested.
 *
 * Pass the already-parsed POST params (so the body stream isn't consumed twice).
 * Throws 403 on any failure. Set TWILIO_SKIP_SIGNATURE_CHECK=true to disable
 * (rollout escape hatch only — re-enable as soon as possible).
 */
export function verifyTwilioSignature(
	request: Request,
	url: URL,
	params: Record<string, string>,
): boolean {
	if (env.TWILIO_SKIP_SIGNATURE_CHECK === 'true') {
		console.warn('[twilio] signature check SKIPPED via TWILIO_SKIP_SIGNATURE_CHECK');
		return true;
	}

	const authToken = env.TWILIO_AUTH_TOKEN;
	const signature = request.headers.get('x-twilio-signature');

	if (!authToken) {
		console.error('[twilio] TWILIO_AUTH_TOKEN not set — rejecting unsigned webhook', url.pathname);
		return false;
	}
	if (!signature) {
		console.error('[twilio] missing X-Twilio-Signature header', url.pathname);
		return false;
	}

	const candidates = new Set<string>();
	candidates.add(url.href);
	candidates.add(url.href.replace(/^http:/, 'https:'));
	const base = env.TWILIO_WEBHOOK_BASE_URL?.replace(/\/+$/, '');
	if (base) candidates.add(`${base}${url.pathname}${url.search}`);

	for (const candidate of candidates) {
		if (twilio.validateRequest(authToken, signature, candidate, params)) return true;
	}

	console.error('[twilio] signature validation FAILED', { path: url.pathname, tried: [...candidates] });
	return false;
}

/** Throwing wrapper for use inside +server.ts route handlers. */
export function assertTwilioSignature(
	request: Request,
	url: URL,
	params: Record<string, string>,
): void {
	if (!verifyTwilioSignature(request, url, params)) throw error(403, 'Forbidden');
}
