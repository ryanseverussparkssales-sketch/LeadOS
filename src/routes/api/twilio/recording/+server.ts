import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/server/supabase';
import { processCallRecording } from '$lib/server/ai';
import type { RequestHandler } from './$types';

// Twilio calls this webhook when the call recording is ready
export const POST: RequestHandler = async ({ request }) => {
	const formData = await request.formData();
	const callSid           = formData.get('CallSid') as string;
	const recordingUrl      = formData.get('RecordingUrl') as string;
	const recordingSid      = formData.get('RecordingSid') as string;
	const recordingStatus   = formData.get('RecordingStatus') as string;
	const recordingDuration = parseInt((formData.get('RecordingDuration') as string) ?? '0');

	console.log('[recording webhook]', { callSid, recordingSid, recordingStatus, recordingDuration });

	// Recording failed or absent — mark processed so the dialer stops polling
	if (recordingStatus === 'absent' || recordingStatus === 'failed') {
		if (callSid) {
			await supabaseAdmin
				.from('calls')
				.update({
					raw_transcript: null,
					summary: 'Recording unavailable',
					processed_at: new Date().toISOString(),
				})
				.eq('twilio_call_sid', callSid);
		}
		return new Response('', { status: 204 });
	}

	if (!callSid || !recordingUrl || recordingStatus !== 'completed') {
		return new Response('', { status: 204 });
	}

	const mp3Url = `${recordingUrl}.mp3`;
	return json({ success: true });
};
