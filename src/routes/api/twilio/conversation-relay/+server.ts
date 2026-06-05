import { env } from '$env/dynamic/private';
import { assertTwilioSignature } from '$lib/server/twilioVerify';
import type { RequestHandler } from './$types';

const escapeXml = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const xmlResponse = (body: string) =>
	new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}`, {
		headers: { 'Content-Type': 'text/xml' },
	});

/**
 * Twilio fetches this URL as the call's Voice URL. It returns TwiML that hands the
 * live audio to our ConversationRelay WebSocket server (the AI qualification agent).
 * The matching WS server lives in /relay-server and must be deployed separately.
 */
export const POST: RequestHandler = async ({ request, url }) => {
	const form = await request.formData();
	const params: Record<string, string> = {};
	for (const [k, v] of form.entries()) params[k] = v as string;
	assertTwilioSignature(request, url, params);

	const wsBase = env.RELAY_WS_URL; // e.g. wss://relay.yourdomain.com
	const base = url.origin.replace(/^http:/, 'https:');

	if (!wsBase) {
		return xmlResponse('<Response><Say>The A I agent is not configured.</Say><Hangup/></Response>');
	}

	// Auth the WS upgrade with a shared secret embedded in the URL (only Twilio + us see this TwiML).
	const wsUrl = env.RELAY_SHARED_SECRET
		? `${wsBase}?token=${encodeURIComponent(env.RELAY_SHARED_SECRET)}`
		: wsBase;

	const callId = url.searchParams.get('callId') ?? '';
	const contactName = url.searchParams.get('contactName') ?? '';
	const mode = url.searchParams.get('mode') ?? 'qualify';
	const persona = url.searchParams.get('persona') ?? '';
	const greeting = mode === 'practice'
		? (env.RELAY_PRACTICE_GREETING ?? 'Hello?')   // the AI buyer answers; the rep pitches
		: (env.RELAY_WELCOME_GREETING ?? "Hi, this is Rogue's assistant calling — do you have a quick minute?");

	const attrs = [
		`url="${escapeXml(wsUrl)}"`,
		`welcomeGreeting="${escapeXml(greeting)}"`,
		env.RELAY_TTS_VOICE ? `voice="${escapeXml(env.RELAY_TTS_VOICE)}"` : '',
		env.RELAY_TTS_PROVIDER ? `ttsProvider="${escapeXml(env.RELAY_TTS_PROVIDER)}"` : '',
		env.RELAY_STT_PROVIDER ? `transcriptionProvider="${escapeXml(env.RELAY_STT_PROVIDER)}"` : '',
	].filter(Boolean).join(' ');

	const parameters = [
		`<Parameter name="callId" value="${escapeXml(callId)}"/>`,
		`<Parameter name="callSid" value="${escapeXml(params['CallSid'] ?? '')}"/>`,
		`<Parameter name="mode" value="${escapeXml(mode)}"/>`,
		persona ? `<Parameter name="persona" value="${escapeXml(persona)}"/>` : '',
		contactName ? `<Parameter name="contactName" value="${escapeXml(contactName)}"/>` : '',
	].filter(Boolean).join('');

	return xmlResponse(
		`<Response>` +
		`<Connect action="${base}/api/twilio/conversation-relay/action">` +
		`<ConversationRelay ${attrs}>${parameters}</ConversationRelay>` +
		`</Connect>` +
		`</Response>`,
	);
};
