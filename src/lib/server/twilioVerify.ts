import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import twilio from 'twilio';
import { supabaseAdmin } from './supabase';
import { decryptValue } from './crypto';

/**
 * Verify an incoming Twilio webhook signature.
 *
 * Twilio signs each request with HMAC-SHA1 over the exact public URL it called
 * plus the (sorted) POST params, using the AUTH_TOKEN of the account the request
 * originated from. We rebuild a few URL candidates because behind Vercel's proxy
 * the reconstructed URL can differ in protocol/host from what Twilio actually
 * requested.
 *
 * BYOC: webhooks from a tenant's own Twilio account are signed with the TENANT's
 * auth token, not the platform's. Every Twilio webhook carries `AccountSid`, so
 * when the platform token doesn't match we resolve the tenant token from
 * `user_settings.twilio_account_sid` and try that too.
 *
 * Pass the already-parsed POST params (so the body stream isn't consumed twice).
 * Set TWILIO_SKIP_SIGNATURE_CHECK=true to disable (dev-only escape hatch —
 * ignored in production).
 */
export async function verifyTwilioSignature(
	request: Request,
	url: URL,
	params: Record<string, string>,
): Promise<boolean> {
	if (env.TWILIO_SKIP_SIGNATURE_CHECK === 'true') {
		if (process.env.NODE_ENV === 'production') {
			console.error('[twilio] TWILIO_SKIP_SIGNATURE_CHECK is set but IGNORED in production');
		} else {
			console.warn('[twilio] signature check SKIPPED via TWILIO_SKIP_SIGNATURE_CHECK');
			return true;
		}
	}

	const signature = request.headers.get('x-twilio-signature');
	if (!signature) {
		console.error('[twilio] missing X-Twilio-Signature header', url.pathname);
		return false;
	}

	const candidates = new Set<string>();
	candidates.add(url.href);
	candidates.add(url.href.replace(/^http:/, 'https:'));
	const base = env.TWILIO_WEBHOOK_BASE_URL?.replace(/\/+$/, '');
	if (base) candidates.add(`${base}${url.pathname}${url.search}`);

	const tokens: string[] = [];
	if (env.TWILIO_AUTH_TOKEN) tokens.push(env.TWILIO_AUTH_TOKEN);

	// BYOC: if the webhook came from a non-platform account, try that tenant's token.
	const accountSid = params.AccountSid ?? '';
	if (accountSid && accountSid !== env.TWILIO_ACCOUNT_SID) {
		const tenantToken = await resolveTenantAuthToken(accountSid);
		if (tenantToken) tokens.push(tenantToken);
	}

	if (tokens.length === 0) {
		console.error('[twilio] no auth token available — rejecting unsigned webhook', url.pathname);
		return false;
	}

	for (const token of tokens) {
		for (const candidate of candidates) {
			if (twilio.validateRequest(token, signature, candidate, params)) return true;
		}
	}

	console.error('[twilio] signature validation FAILED', {
		path: url.pathname,
		accountSid,
		tokensTried: tokens.length,
		tried: [...candidates],
	});
	return false;
}

/** Resolve a BYOC tenant's auth token by the Twilio AccountSid on the webhook. */
async function resolveTenantAuthToken(accountSid: string): Promise<string | null> {
	// Defensive: AccountSid format is AC + 32 hex chars; don't query on garbage.
	if (!/^AC[0-9a-fA-F]{32}$/.test(accountSid)) return null;
	const { data } = await supabaseAdmin
		.from('user_settings')
		.select('twilio_auth_token')
		.eq('twilio_account_sid', accountSid)
		.limit(1)
		.maybeSingle();
	const stored = data?.twilio_auth_token as string | undefined;
	if (!stored) return null;
	try {
		return decryptValue(stored);
	} catch {
		return stored; // historical plaintext
	}
}

/** Throwing wrapper for use inside +server.ts route handlers. */
export async function assertTwilioSignature(
	request: Request,
	url: URL,
	params: Record<string, string>,
): Promise<void> {
	if (!(await verifyTwilioSignature(request, url, params))) throw error(403, 'Forbidden');
}
