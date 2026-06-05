/**
 * Per-tenant Twilio credential resolution.
 *
 * Each agency can bring its own Twilio account (collected during onboarding and
 * stored on `user_settings`). Before this helper existed, every route read creds
 * straight from `env` — the platform owner's single account — so a self-serve
 * customer's saved creds sat unused and their dialer could never use their own
 * account. This resolves the *effective owner's* creds first and falls back to the
 * platform `env` account only when the tenant hasn't configured their own.
 *
 * Secret fields (auth token, API key secret) may be stored encrypted; we decrypt
 * tolerantly so historical plaintext values keep working.
 */
import { env } from '$env/dynamic/private';
import { supabaseAdmin, getEffectiveUserId } from './supabase';
import { decryptValue } from './crypto';
import twilio from 'twilio';

export interface TwilioCreds {
	accountSid: string;
	authToken: string;
	apiKeySid: string;
	apiKeySecret: string;
	twimlAppSid: string;
	clientIdentity: string;
	phoneNumber: string;
	/** The effective owner (agency) id these creds belong to. */
	ownerId: string;
	/** A REST-capable account SID + auth token pair is present. */
	hasRest: boolean;
	/** A browser-voice (AccessToken) set is present: account SID + API key pair + TwiML app. */
	hasVoice: boolean;
	/** Where the creds came from — useful for logging/debugging. */
	source: 'user' | 'env';
}

function tryDecrypt(v: unknown): string {
	if (!v || typeof v !== 'string') return '';
	try {
		return decryptValue(v);
	} catch {
		return v; // historical plaintext
	}
}

/**
 * Resolve the Twilio credentials that should be used for a given user.
 * Team members resolve to their agency owner's account.
 */
export async function getTwilioCreds(userId: string): Promise<TwilioCreds> {
	const ownerId = await getEffectiveUserId(userId);

	const { data } = await supabaseAdmin
		.from('user_settings')
		.select(
			'twilio_account_sid, twilio_auth_token, twilio_api_key_sid, twilio_api_key_secret, twilio_twiml_app_sid, twilio_client_identity, twilio_phone_number'
		)
		.eq('user_id', ownerId)
		.maybeSingle();

	const u = (data ?? {}) as Record<string, unknown>;
	const userAccountSid = (u.twilio_account_sid as string) || '';

	// A tenant's account "wins" the moment they've supplied their own account SID —
	// never mix one account's SID with another account's API keys.
	if (userAccountSid) {
		const accountSid = userAccountSid;
		const authToken = tryDecrypt(u.twilio_auth_token);
		const apiKeySid = (u.twilio_api_key_sid as string) || '';
		const apiKeySecret = tryDecrypt(u.twilio_api_key_secret);
		const twimlAppSid = (u.twilio_twiml_app_sid as string) || '';
		return {
			accountSid,
			authToken,
			apiKeySid,
			apiKeySecret,
			twimlAppSid,
			clientIdentity: (u.twilio_client_identity as string) || env.TWILIO_CLIENT_IDENTITY || 'agent',
			phoneNumber: (u.twilio_phone_number as string) || env.TWILIO_PHONE_NUMBER || '',
			ownerId,
			hasRest: !!(accountSid && authToken),
			hasVoice: !!(accountSid && apiKeySid && apiKeySecret && twimlAppSid),
			source: 'user',
		};
	}

	// Platform fallback — the env account.
	const envApp = env.TWILIO_APP_SID ?? env.TWILIO_TWIML_APP_SID ?? '';
	const accountSid = env.TWILIO_ACCOUNT_SID ?? '';
	const authToken = env.TWILIO_AUTH_TOKEN ?? '';
	const apiKeySid = env.TWILIO_API_KEY_SID ?? '';
	const apiKeySecret = env.TWILIO_API_KEY_SECRET ?? '';
	return {
		accountSid,
		authToken,
		apiKeySid,
		apiKeySecret,
		twimlAppSid: envApp,
		clientIdentity: env.TWILIO_CLIENT_IDENTITY ?? 'agent',
		phoneNumber: env.TWILIO_PHONE_NUMBER ?? '',
		ownerId,
		hasRest: !!(accountSid && authToken),
		hasVoice: !!(accountSid && apiKeySid && apiKeySecret && envApp),
		source: 'env',
	};
}

/**
 * The Twilio client identity a tenant's browsers register as — and that inbound
 * calls dial. Must be UNIQUE per account: the legacy shared default ('agent') made
 * `client:agent` ambiguous platform-wide, so one tenant's call could ring another
 * tenant's browser. We derive a per-account identity from the owner id; an owner who
 * deliberately set a custom (non-default) identity keeps it. Browsers within one
 * account share this identity and ring together as a group.
 */
export function resolveClientIdentity(creds: TwilioCreds): string {
	const configured = creds.clientIdentity;
	if (configured && configured !== 'agent') return configured;
	return `acct_${creds.ownerId}`;
}

/**
 * Convenience: a REST-capable Twilio client for the user's effective account.
 * Returns null when no usable REST credentials are configured.
 */
export async function getTwilioClient(userId: string): Promise<ReturnType<typeof twilio> | null> {
	const creds = await getTwilioCreds(userId);
	if (!creds.hasRest) return null;
	return twilio(creds.accountSid, creds.authToken);
}

/** Basic-auth header value for the user's effective account (for raw REST fetches). */
export function twilioBasicAuth(creds: TwilioCreds): string {
	return 'Basic ' + Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString('base64');
}
