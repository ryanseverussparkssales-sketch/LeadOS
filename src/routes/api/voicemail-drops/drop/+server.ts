import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	const { callSid: directSid, vmDropId, callId } = await request.json();
	if (!vmDropId) throw error(400, 'vmDropId required');

	// Get the voicemail drop record (scoped to owner)
	const { data: vm } = await supabaseAdmin
		.from('voicemail_drops')
		.select('id, audio_url, title')
		.eq('id', vmDropId)
		.eq('user_id', ownerId)
		.single();

	if (!vm?.audio_url) throw error(404, 'Voicemail drop not found or no audio');

	// Resolve Twilio CallSid — prefer direct, fall back to DB lookup via callId
	let callSid = directSid ?? null;
	if (!callSid && callId) {
		const { data: callRecord } = await supabaseAdmin
			.from('calls')
			.select('twilio_call_sid')
			.eq('id', callId)
			.eq('user_id', ownerId)
			.single();
		callSid = callRecord?.twilio_call_sid ?? null;
	}
	if (!callSid) throw error(400, 'No active call SID available');

	if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
		throw error(500, 'Twilio credentials not configured');
	}
	return json({ success: true });
};
