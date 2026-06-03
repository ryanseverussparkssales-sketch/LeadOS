import { json, error } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';
import twilio from 'twilio';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);

	// Support both TWILIO_APP_SID and TWILIO_TWIML_APP_SID for compatibility
	const { TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET } = env;
	const TWILIO_APP_SID = env.TWILIO_APP_SID ?? env.TWILIO_TWIML_APP_SID;

	console.log('Twilio env check:', {
		hasAccountSid: !!TWILIO_ACCOUNT_SID,
		hasKeySid: !!TWILIO_API_KEY_SID,
		hasKeySecret: !!TWILIO_API_KEY_SECRET,
		hasTwimlApp: !!TWILIO_APP_SID,
		twimlAppSid: TWILIO_APP_SID?.slice(0, 6) + '...',
	});

	if (!TWILIO_API_KEY_SID || !TWILIO_API_KEY_SECRET || !TWILIO_ACCOUNT_SID || !TWILIO_APP_SID) {
		console.error('Missing Twilio env vars:', {
			hasAccountSid: !!TWILIO_ACCOUNT_SID,
			hasKeySid: !!TWILIO_API_KEY_SID,
			hasKeySecret: !!TWILIO_API_KEY_SECRET,
			hasTwimlApp: !!TWILIO_APP_SID,
		});
		throw error(500, 'Twilio credentials not configured');
	}

	const AccessToken = twilio.jwt.AccessToken;
	const VoiceGrant = AccessToken.VoiceGrant;

	const voiceGrant = new VoiceGrant({
		outgoingApplicationSid: TWILIO_APP_SID,
		incomingAllow: true,
	});

	// Identity must match what /api/phone/incoming dials via dial.client()
	const clientIdentity = env.TWILIO_CLIENT_IDENTITY ?? 'agent';

	const token = new AccessToken(
		TWILIO_ACCOUNT_SID,
		TWILIO_API_KEY_SID,
		TWILIO_API_KEY_SECRET,
		clientIdentity,
		{ ttl: 3600 }
	);
	token.addGrant(voiceGrant);

	return json({ token: token.toJwt(), identity: clientIdentity });
};

export const GET: RequestHandler = async () => {
	return new Response('<Response/>', { headers: { 'Content-Type': 'application/xml' } });
};
