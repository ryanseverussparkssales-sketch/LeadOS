import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// Twilio webhook — no auth header (Twilio signs requests differently)
export const POST: RequestHandler = async ({ request }) => {
	const formData = await request.formData();
	const callSid = formData.get('CallSid') as string;
	const recordingUrl = formData.get('RecordingUrl') as string;
	const duration = parseInt(formData.get('CallDuration') as string ?? '0');

	if (!callSid) return json({ success: false });

	// Update call record
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
