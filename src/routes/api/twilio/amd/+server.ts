import { supabaseAdmin } from '$lib/server/supabase';
import twilio from 'twilio';
import type { RequestHandler } from './$types';

// Twilio calls this when AMD (Answering Machine Detection) fires
export const POST: RequestHandler = async ({ request }) => {
	const form = await request.formData();
	const callSid = form.get('CallSid') as string;
	const answeredBy = form.get('AnsweredBy') as string; // human | machine_start | machine_end_beep | fax

	console.log('[AMD]', callSid, '→', answeredBy);

	const VR = twilio.twiml.VoiceResponse;
	const twiml = new VR();

	if (answeredBy?.startsWith('machine')) {
		// Find the call record to get user_id and auto-drop VM
		const { data: call } = await supabaseAdmin
			.from('calls').select('id, user_id').eq('twilio_call_sid', callSid).maybeSingle();

		if (call) {
			// Mark call outcome as voicemail
			await supabaseAdmin.from('calls').update({ outcome: 'voicemail' }).eq('id', call.id);

			// Find default VM drop for this user
			const { data: vmDrop } = await supabaseAdmin
				.from('voicemail_drops').select('audio_url').eq('user_id', call.user_id).eq('is_default', true).maybeSingle();

			if (vmDrop?.audio_url) {
				twiml.play(vmDrop.audio_url);
			} else {
				twiml.say({ voice: 'Polly.Joanna' }, 'Please leave a message and we will get back to you shortly.');
			}
		}
		twiml.hangup();
	}
	// If human, return empty TwiML (Twilio continues normal call flow)

	return new Response(twiml.toString(), { headers: { 'Content-Type': 'application/xml' } });
};
