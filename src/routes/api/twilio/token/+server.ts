import { json, error } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/supabase';
import { getTwilioCreds, resolveClientIdentity } from '$lib/server/twilio';
import twilio from 'twilio';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);

	// Resolve the tenant's own Twilio account (falls back to the platform env account).
	const creds = await getTwilioCreds(user.id);

	if (!creds.hasVoice) {
		console.error('[twilio/token] no browser-voice credentials', {
			source: creds.source,
			hasAccountSid: !!creds.accountSid,
			hasKeySid: !!creds.apiKeySid,
			hasKeySecret: !!creds.apiKeySecret,
			hasTwimlApp: !!creds.twimlAppSid,
		});
		throw error(500, 'Twilio credentials not configured — add them in onboarding or Settings.');
	}

	const AccessToken = twilio.jwt.AccessToken;
	const VoiceGrant = AccessToken.VoiceGrant;

	const voiceGrant = new VoiceGrant({
		outgoingApplicationSid: creds.twimlAppSid,
		incomingAllow: true,
	});

	// Identity must match what /api/phone/incoming dials via dial.client().
	// Per-account (not the shared 'agent') so calls never cross tenants.
	const clientIdentity = resolveClientIdentity(creds);

	const token = new AccessToken(
		creds.accountSid,
		creds.apiKeySid,
		creds.apiKeySecret,
		{ ttl: 3600, identity: clientIdentity }
	);
	token.addGrant(voiceGrant);

	return json({ token: token.toJwt(), identity: clientIdentity });
};

export const GET: RequestHandler = async () => {
	return new Response('<Response/>', { headers: { 'Content-Type': 'application/xml' } });
};
