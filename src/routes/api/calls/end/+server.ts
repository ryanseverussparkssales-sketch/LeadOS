import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';
import { assertTwilioSignature } from '$lib/server/twilioVerify';
import type { RequestHandler } from './$types';

// Twilio status/recording webhook. Twilio signs requests with X-Twilio-Signature;
// we verify it before trusting any field — otherwise anyone could POST a CallSid
// with an arbitrary RecordingUrl/duration and overwrite call records.
export const POST: RequestHandler = async ({ request, url }) => {
	const formData = await request.formData();
	const params: Record<string, string> = {};
	for (const [k, v] of formData.entries()) params[k] = typeof v === 'string' ? v : '';

	await assertTwilioSignature(request, url, params);

	const callSid = params.CallSid;
	const recordingUrl = params.RecordingUrl;
	const duration = parseInt(params.CallDuration ?? '0');

	if (!callSid) return json({ success: false });

	await supabaseAdmin
		.from('calls')
		.update({
			recording_url: recordingUrl,
			call_duration_seconds: duration,
			ended_at: new Date().toISOString(),
		})
		.eq('twilio_call_sid', callSid);

	return json({ success: true });
};
