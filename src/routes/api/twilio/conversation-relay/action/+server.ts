import { env } from '$env/dynamic/private';
import { assertTwilioSignature } from '$lib/server/twilioVerify';
import type { RequestHandler } from './$types';

const xml = (body: string) =>
	new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}`, {
		headers: { 'Content-Type': 'text/xml' },
	});

/**
 * Twilio requests this when the <Connect><ConversationRelay> session ends. The
 * `HandoffData` field carries whatever the WS agent sent in its `end` message
 * (e.g. {"outcome":"human"}). If the agent asked to transfer to a person, dial a
 * human; otherwise let the call end. (The transcript/outcome was already persisted
 * by the WS server.)
 */
export const POST: RequestHandler = async ({ request, url }) => {
	const form = await request.formData();
	const params: Record<string, string> = {};
	for (const [k, v] of form.entries()) params[k] = v as string;
	await assertTwilioSignature(request, url, params);

	let handoff: { outcome?: string } = {};
	try { handoff = JSON.parse(params['HandoffData'] ?? '{}'); } catch { /* ignore */ }

	console.log('[conversation-relay/action]', {
		sessionStatus: params['SessionStatus'],
		duration: params['SessionDuration'],
		outcome: handoff.outcome,
	});

	// Transfer to a human if requested and a handoff number is configured.
	if (handoff.outcome === 'human' && env.RELAY_HANDOFF_NUMBER) {
		const n = env.RELAY_HANDOFF_NUMBER.replace(/&/g, '&amp;').replace(/</g, '&lt;');
		return xml(`<Response><Say>Connecting you now.</Say><Dial>${n}</Dial></Response>`);
	}

	return xml('<Response><Hangup/></Response>');
};
