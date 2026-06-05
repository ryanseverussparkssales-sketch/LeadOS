import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/server/supabase';
import { assertTwilioSignature } from '$lib/server/twilioVerify';
import twilio from 'twilio';
import type { RequestHandler } from './$types';

// Twilio calls this when AMD (Answering Machine Detection) fires
export const POST: RequestHandler = async ({ request, url }) => {
	const form = await request.formData();
	const params: Record<string, string> = {};
	for (const [k, v] of form.entries()) params[k] = v as string;
	assertTwilioSignature(request, url, params);

	const callSid = form.get('CallSid') as string;
	const answeredBy = form.get('AnsweredBy') as string; // human | machine_end_beep | machine_end_silence | fax | unknown

	console.log('[AMD]', callSid, '→', answeredBy);

	// IMPORTANT: amdStatusCallback is a NOTIFICATION webhook — TwiML returned here is NOT
	// executed by Twilio. To actually leave a voicemail we must redirect the dialed (child)
	// call leg via the REST API. Gated behind TWILIO_AMD_ENABLED until smoke-tested on a live call.
	if (env.TWILIO_AMD_ENABLED === 'true' && callSid && answeredBy?.startsWith('machine')) {
		const { data: call } = await supabaseAdmin
			.from('calls').select('id, user_id').eq('twilio_call_sid', callSid).maybeSingle();

		if (call) {
			await supabaseAdmin.from('calls').update({ outcome: 'voicemail' }).eq('id', call.id);

			const { data: vmDrop } = await supabaseAdmin
				.from('voicemail_drops').select('audio_url').eq('user_id', call.user_id).eq('is_default', true).maybeSingle();

			const vr = new twilio.twiml.VoiceResponse();
			if (vmDrop?.audio_url) vr.play(vmDrop.audio_url);
			else vr.say({ voice: 'Polly.Joanna' }, 'Please leave a message and we will get back to you shortly.');
			vr.hangup();

			const accountSid = env.TWILIO_ACCOUNT_SID;
			const authToken = env.TWILIO_AUTH_TOKEN;
			if (accountSid && authToken) {
				try {
					await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callSid}.json`, {
						method: 'POST',
						headers: {
							'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
							'Content-Type': 'application/x-www-form-urlencoded',
						},
						body: new URLSearchParams({ Twiml: vr.toString() }),
					});
				} catch (e) {
					console.error('[AMD] call redirect failed:', e);
				}
			}
		}
	}

	// Twilio ignores the response body for amdStatusCallback — just ACK.
	return new Response('', { status: 200 });
};
