import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/server/supabase';
import twilio from 'twilio';
import type { RequestHandler } from './$types';

// Twilio webhook — called for outbound and inbound calls
export const POST: RequestHandler = async ({ request, url }) => {
	const VoiceResponse = twilio.twiml.VoiceResponse;

	try {
		const formData = await request.formData();
		const params: Record<string, string> = {};
		for (const [k, v] of formData.entries()) params[k] = v as string;

		let to       = (params['To']        ?? '').trim();
		const from      = (params['From']      ?? '').trim();
		const direction = (params['Direction'] ?? '').toLowerCase();
		const called    = (params['Called']    ?? '').trim();
		const callId    = params['CallId']  ?? '';
		const callSid   = params['CallSid'] ?? '';
		const passedCallerId = (params['CallerId'] ?? '').trim();

		if (to && !to.startsWith('+')) {
			to = '+' + to.replace(/\D/g, '');
		}

		const baseUrl = url.origin;
		const twiml = new VoiceResponse();

		const isInbound = direction === 'inbound' || (!callId && !!from && !!called);

		if (isInbound) {
			const inboundTo = to || called;
			const normalizedTo = inboundTo.replace(/\D/g, '');

			const { data: phoneNumber } = await supabaseAdmin
				.from('phone_numbers')
				.select('id, user_id, client_id, campaign_id, forwarding_enabled, forwarding_number, voicemail_enabled, voicemail_greeting, voicemail_greeting_url')
				.or(`phone_number.eq.${inboundTo},phone_normalized.eq.${normalizedTo}`)
				.maybeSingle();

			if (phoneNumber?.user_id) {
				await supabaseAdmin.from('calls').insert({
					user_id: phoneNumber.user_id,
					phone_number_id: phoneNumber.id,
					client_id: phoneNumber.client_id ?? null,
					direction: 'inbound',
					from_number: from,
					to_number: inboundTo,
					twilio_call_sid: callSid,
					status: 'ringing',
					call_type: 'inbound',
				});
			}

			if (phoneNumber?.forwarding_enabled && phoneNumber.forwarding_number) {
				const dial = twiml.dial({
					timeout: 25,
					record: 'record-from-ringing',
					recordingStatusCallback: `${baseUrl}/api/twilio/recording`,
					recordingStatusCallbackMethod: 'POST',
					action: `${baseUrl}/api/twilio/status`,
					method: 'POST',
				} as Parameters<typeof twiml.dial>[0]);
				dial.number(phoneNumber.forwarding_number);
			} else {
				const clientIdentity = env.TWILIO_CLIENT_IDENTITY ?? 'agent';
				const dial = twiml.dial({
					timeout: 30,
					record: 'record-from-ringing',
					recordingStatusCallback: `${baseUrl}/api/twilio/recording`,
					recordingStatusCallbackMethod: 'POST',
					action: `${baseUrl}/api/twilio/status`,
					method: 'POST',
				} as Parameters<typeof twiml.dial>[0]);
				dial.client(clientIdentity);
			}

			const greetingText = phoneNumber?.voicemail_greeting
				?? 'You have reached our voicemail. Please leave a message after the tone.';
			if (phoneNumber?.voicemail_greeting_url) {
				twiml.play(phoneNumber.voicemail_greeting_url);
			} else {
				twiml.say({ voice: 'Polly.Joanna' }, greetingText);
			}
			twiml.record({
				maxLength: 120,
				transcribe: true,
				transcribeCallback: `${baseUrl}/api/twilio/recording`,
				recordingStatusCallback: `${baseUrl}/api/twilio/recording`,
				recordingStatusCallbackMethod: 'POST',
			});
			twiml.hangup();

			return new Response(twiml.toString(), { headers: { 'Content-Type': 'application/xml' } });
		}

		// ── OUTBOUND ──────────────────────────────────────────────────────────
		const outboundCallerId = passedCallerId || env.TWILIO_PHONE_NUMBER;

		if (callId && callSid) {
			supabaseAdmin.from('calls')
				.update({ twilio_call_sid: callSid })
				.eq('id', callId)
				.then(({ error }) => { if (error) console.error('[voice] DB update error:', error); })
				.catch(console.error);
		}

		if (!to || !outboundCallerId) {
			twiml.say('Configuration error. Please check server settings.');
			return new Response(twiml.toString(), { headers: { 'Content-Type': 'application/xml' } });
		}

		// TCPA compliance — brief recording cue to SDR only (plays before dialing)
		twiml.say({ voice: 'Polly.Salli', language: 'en-US' }, 'Recording.');

		const dial = twiml.dial({
			callerId: outboundCallerId,
			machineDetection: 'DetectMessageEnd',
			asyncAmd: 'true',
			amdStatusCallback: `${baseUrl}/api/twilio/amd`,
			amdStatusCallbackMethod: 'POST',
			record: 'record-from-ringing',
			recordingStatusCallback: `${baseUrl}/api/twilio/recording`,
			recordingStatusCallbackMethod: 'POST',
			action: `${baseUrl}/api/twilio/status`,
			method: 'POST',
		});
		dial.number(to);

		return new Response(twiml.toString(), { headers: { 'Content-Type': 'application/xml' } });

	} catch (err) {
		console.error('[voice webhook] FATAL ERROR:', err);
		const twiml = new VoiceResponse();
		twiml.say('A server error occurred.');
		return new Response(twiml.toString(), { status: 200, headers: { 'Content-Type': 'application/xml' } });
	}
};

export const GET: RequestHandler = async () => {
	return new Response('<Response/>', { headers: { 'Content-Type': 'application/xml' } });
};
