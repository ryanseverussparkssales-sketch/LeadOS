import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// Twilio calls this when the call ends (via <Dial action="">)
export const POST: RequestHandler = async ({ request }) => {
	const formData = await request.formData();
	const parentCallSid = formData.get('CallSid') as string;   // leg A SID (browser→Twilio)
	const dialCallSid  = formData.get('DialCallSid') as string; // leg B SID (Twilio→contact)
	const dialStatus   = (formData.get('DialCallStatus') as string ?? '').toLowerCase();
	const duration     = parseInt(formData.get('DialCallDuration') as string ?? '0');
	const to           = formData.get('To') as string;
	const from         = formData.get('From') as string;
	const callerId     = formData.get('CallerId') as string;

	// Map Twilio dial status → our outcome
	const outcomeMap: Record<string, string> = {
		completed: 'answered',
		answered:  'answered',
		busy:      'busy',
		'no-answer': 'no_answer',
		failed:    'no_answer',
		canceled:    'no_answer',
	};
	const outcome = outcomeMap[dialStatus];

	const sidToLook = dialCallSid || callSid;
	if (!sidToLook) return new Response('', { status: 200 });

	const { data: call } = await supabaseAdmin
		.from('calls').select('id, outcome, user_id')
		.eq('twilio_call_sid', sidToLook).maybeSingle();

	if (call) {
		const repOutcomes = new Set(['appointment_set','demo_scheduled','meeting_confirmed',
			'signed_up','callback','not_interested','do_not_call','follow_up_agreed',
			'left_voicemail','wrong_number','info_requested','referral']);
		const updates: Record<string, unknown> = {
			call_duration_seconds: duration > 0 ? duration : undefined,
			ended_at: new Date().toISOString(),
		};
		if (outcome && !repOutcomes.has(call.outcome ?? '')) updates.outcome = outcome;
		if (recordingUrl) { updates.recording_url = recordingUrl + '.mp3'; updates.recording_sid = recordingSid; }
		await supabaseAdmin.from('calls').update(updates).eq('id', call.id);
	}

	return new Response('', { status: 200 });
};

export const GET: RequestHandler = async () => new Response('', { status: 200 });
