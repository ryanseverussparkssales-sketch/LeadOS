import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const path   = event.url.pathname;
	const method = event.request.method;

	console.log(`[hooks] ${method} ${path}`);

	// Bypass CSRF for ALL Twilio webhooks by handling them before resolve()
	if (method === 'POST' && path === '/api/twilio/voice') {
		console.log('[hooks] Voice webhook hit — returning TwiML');

		// Dynamic imports inside the handler avoid module-level load failures
		const [{ default: twilio }, { env }, { supabaseAdmin }] = await Promise.all([
			import('twilio'),
			import('$env/dynamic/private'),
			import('$lib/server/supabase'),
		]);

		const VoiceResponse = twilio.twiml.VoiceResponse;
		const twiml = new VoiceResponse();

		try {
			const form = await event.request.formData();
			let to = (form.get('To') as string ?? '').trim();
			if (to && !to.startsWith('+')) to = '+' + to.replace(/\D/g, '');

			const callId     = form.get('CallId')  as string;
			const callSid    = form.get('CallSid') as string;
			// Honour the caller-ID the client selected; fall back to env var
			const passedCallerId = (form.get('CallerId') as string)?.trim() || null;
			const callerId   = passedCallerId || env.TWILIO_PHONE_NUMBER || '';

			console.log('[voice] to:', to, '| callSid:', callSid, '| callerId:', callerId);

			if (callId && callSid) {
				// Fire-and-forget — use .then() not .catch() (Supabase v2)
				supabaseAdmin.from('calls')
					.update({ twilio_call_sid: callSid })
					.eq('id', callId)
					.then(({ error }) => { if (error) console.error('[voice] DB error:', error); });
			}

			if (to && callerId) {
				// Force https — ngrok serves https but event.url.origin returns http
				const base = event.url.origin.replace('http://', 'https://');
				console.log('[voice] base URL:', base);
				const dial = twiml.dial(
					{
						callerId,
						action: base + '/api/twilio/status',
						method: 'POST' as const,
						record: 'record-from-ringing' as const,
						recordingStatusCallback: base + '/api/twilio/recording',
						recordingStatusCallbackMethod: 'POST' as const,
					},
					to
				);
				console.log('[voice] TwiML:', twiml.toString());
				void dial; // suppress unused-variable warning
			} else {
				console.error('[voice] Missing to or callerId:', { to, callerId, hasTwilioEnv: !!env.TWILIO_PHONE_NUMBER });
				twiml.say('Configuration error. Please check your Twilio phone number settings.');
			}
		} catch (err) {
			console.error('[voice] error:', err);
			twiml.say('Server error.');
		}

		return new Response(twiml.toString(), {
			headers: { 'Content-Type': 'application/xml' },
		});
	}

	if ((method === 'POST' || method === 'GET') && path === '/api/twilio/recording') {
		console.log('[hooks] Recording webhook hit');
		(async () => {
			try {
				const { supabaseAdmin } = await import('$lib/server/supabase');
				const { processCallRecording } = await import('$lib/server/ai');
				const form = await event.request.clone().formData();
				const callSid      = form.get('CallSid') as string;
				const recordingUrl = form.get('RecordingUrl') as string;
				const status       = form.get('RecordingStatus') as string;
				if (callSid && recordingUrl && status === 'completed') {
					const { data: call } = await supabaseAdmin
						.from('calls').select('id').eq('twilio_call_sid', callSid).maybeSingle();
					if (call) {
						await supabaseAdmin.from('calls')
							.update({ recording_url: `${recordingUrl}.mp3` }).eq('id', call.id);
						processCallRecording(call.id, recordingUrl)
							.then(async () => {
								const { logCallCost } = await import('$lib/server/analytics');
								const { data: callData } = await supabaseAdmin
									.from('calls').select('user_id, call_duration_seconds, raw_transcript')
									.eq('id', call.id).single();
								if (callData) {
									await logCallCost(
										callData.user_id,
										call.id,
										callData.call_duration_seconds ?? 0,
										!!callData.raw_transcript
									);
								}
							})
							.catch(console.error);
					}
				}
			} catch (err) { console.error('[recording] error:', err); }
		})();
		return new Response('', { status: 200 });
	}

	if ((method === 'POST' || method === 'GET') && path === '/api/twilio/status') {
		(async () => {
			try {
				const { supabaseAdmin } = await import('$lib/server/supabase');
				const form = await event.request.clone().formData();
				const callSid = form.get('CallSid') as string;
				const dur     = parseInt(form.get('DialCallDuration') as string ?? '0');
				const { data: call } = await supabaseAdmin
					.from('calls').select('id').eq('twilio_call_sid', callSid).maybeSingle();
				if (call) {
					await supabaseAdmin.from('calls').update({
						call_duration_seconds: dur, ended_at: new Date().toISOString(),
					}).eq('id', call.id);
				}
			} catch (err) { console.error('[status] error:', err); }
		})();
		return new Response('', { status: 200 });
	}

	// ── Incoming call (voicemail / missed call tracking) ────────────────────
	if (method === 'POST' && path === '/api/phone/incoming') {
		console.log('[incoming] call received');
		try {
			const { default: twilio } = await import('twilio');
			const { env } = await import('$env/dynamic/private');
			const { supabaseAdmin } = await import('$lib/server/supabase');
			const form = await event.request.formData();
			const params: Record<string, string> = {};
			for (const [k, v] of form.entries()) params[k] = v as string;
			console.log('[incoming]', params);

			const callerNum = params['From'] ?? 'Unknown';
			const calledNum = params['To'] ?? '';
			const base = event.url.origin.replace('http://', 'https://');

			const { data: phoneRec } = await supabaseAdmin
				.from('phone_numbers').select('id, user_id, voicemail_greeting, record_incoming, forwarding_enabled, forwarding_number, voicemail_enabled, ring_timeout_seconds')
				.eq('phone_number', calledNum).eq('status', 'active').maybeSingle();

			const VR = twilio.twiml.VoiceResponse;
			const twiml = new VR();

			if (phoneRec) {
				const ringTimeout = phoneRec.ring_timeout_seconds ?? 25;
				const clientIdentity = env.TWILIO_CLIENT_IDENTITY ?? 'agent';

				if (phoneRec.forwarding_enabled && phoneRec.forwarding_number) {
					// Forward to external number
					const dial = twiml.dial({
						callerId: callerNum,
						timeout: ringTimeout,
						action: base + '/api/phone/forward-status',
						method: 'POST',
					});
					dial.number(phoneRec.forwarding_number);
				} else {
					// Ring the browser app (WebRTC client) first
					// action fires if client doesn't answer → goes to voicemail
					const dial = twiml.dial({
						timeout: ringTimeout,
						action: base + '/api/phone/forward-status',
						method: 'POST',
						record: 'record-from-ringing',
						recordingStatusCallback: base + '/api/twilio/recording',
						recordingStatusCallbackMethod: 'POST',
					} as any);
					dial.client(clientIdentity);
				}
			} else {
				// Number not in DB — ring browser with default identity
				const clientIdentity = env.TWILIO_CLIENT_IDENTITY ?? 'agent';
				const dial = twiml.dial({
					timeout: 25,
					action: base + '/api/phone/forward-status',
					method: 'POST',
				} as any);
				dial.client(clientIdentity);
			}

			return new Response(twiml.toString(), { headers: { 'Content-Type': 'application/xml' } });
		} catch (err) {
			console.error('[incoming] error:', err);
			return new Response('<Response><Say>Error.</Say></Response>', { headers: { 'Content-Type': 'application/xml' } });
		}
	}

	// ── Forward status — called when a forwarded call is not answered ────────
	if (method === 'POST' && path === '/api/phone/forward-status') {
		console.log('[forward-status] call received');
		try {
			const { default: twilio } = await import('twilio');
			const { supabaseAdmin } = await import('$lib/server/supabase');
			const form = await event.request.formData();
			const calledNum = (form.get('To') ?? form.get('Called')) as string;
			const dialCallStatus = form.get('DialCallStatus') as string;

			const VR = twilio.twiml.VoiceResponse;
			const twiml = new VR();
			const base = event.url.origin.replace('http://', 'https://');

			if (['no-answer', 'busy', 'failed', 'canceled'].includes(dialCallStatus)) {
				const { data: phoneRec } = await supabaseAdmin
					.from('phone_numbers').select('voicemail_greeting, voicemail_enabled')
					.eq('phone_number', calledNum).eq('status', 'active').maybeSingle();

				if (phoneRec?.voicemail_enabled !== false) {
					twiml.say({ voice: 'Polly.Joanna' }, phoneRec?.voicemail_greeting ?? 'Please leave a message after the tone.');
					twiml.record({
						maxLength: 120,
						recordingStatusCallback: base + '/api/phone/voicemail-recording',
						recordingStatusCallbackMethod: 'POST',
						finishOnKey: '#',
						transcribeCallback: base + '/api/phone/voicemail-recording',
					});
				} else {
					twiml.say('The party you are trying to reach is unavailable.');
				}
			}

			return new Response(twiml.toString(), { headers: { 'Content-Type': 'application/xml' } });
		} catch (err) {
			console.error('[forward-status] error:', err);
			return new Response('<Response><Say>Error processing call.</Say></Response>', { headers: { 'Content-Type': 'application/xml' } });
		}
	}

	// ── Voicemail recording ready ────────────────────────────────────────────
	if ((method === 'POST' || method === 'GET') && path === '/api/phone/voicemail-recording') {
		(async () => {
			try {
				const { supabaseAdmin } = await import('$lib/server/supabase');
				const form = await event.request.clone().formData();
				const recordingUrl = form.get('RecordingUrl') as string;
				const callerNum    = (form.get('From') ?? form.get('Caller')) as string;
				const calledNum    = (form.get('To')   ?? form.get('Called')) as string;
				const duration     = parseInt(form.get('RecordingDuration') as string ?? '0');
				console.log('[voicemail]', { callerNum, calledNum, recordingUrl });

				if (recordingUrl && calledNum) {
					const { data: phoneRec } = await supabaseAdmin
						.from('phone_numbers').select('id, user_id')
						.eq('phone_number', calledNum).eq('status', 'active').maybeSingle();

					if (phoneRec) {
						// Try to match caller to a contact for the callback task
						const callerNorm = callerNum?.replace(/\D/g, '') ?? '';
						const { data: matchedContact } = await supabaseAdmin
							.from('contacts')
							.select('id, name')
							.eq('user_id', phoneRec.user_id)
							.eq('phone_normalized', callerNorm)
							.maybeSingle();

						const { data: vm } = await supabaseAdmin.from('voicemails').insert({
							user_id: phoneRec.user_id,
							phone_number_id: phoneRec.id,
							caller_id: callerNum ?? 'Unknown',
							duration_seconds: duration,
							recording_url: recordingUrl + '.mp3',
							status: 'unread',
						}).select().single();

						// Auto-create a callback task so the voicemail doesn't get lost
						await supabaseAdmin.from('tasks').insert({
							user_id: phoneRec.user_id,
							contact_id: matchedContact?.id ?? null,
							title: `Callback: voicemail from ${matchedContact?.name ?? callerNum ?? 'Unknown'}`,
							task_type: 'callback',
							priority: 'high',
							status: 'pending',
							notes: `Inbound voicemail received. Check /phone for recording.`,
							due_date: new Date(Date.now() + 4 * 3600_000).toISOString(), // 4 hours
						}).catch(() => {});

						if (vm) {
							const { env } = await import('$env/dynamic/private');
							const authHeader = 'Basic ' + Buffer.from(env.TWILIO_ACCOUNT_SID + ':' + env.TWILIO_AUTH_TOKEN).toString('base64');
							const audioRes = await fetch(recordingUrl + '.mp3', { headers: { Authorization: authHeader } });
							if (audioRes.ok) {
								const audioBuffer = await audioRes.arrayBuffer();
								const audioFile = new File([audioBuffer], 'voicemail.mp3', { type: 'audio/mpeg' });
								const fd = new FormData();
								fd.append('file', audioFile);
								fd.append('model', 'whisper-large-v3');
								fd.append('response_format', 'text');
								const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
									method: 'POST',
									headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
									body: fd,
								});
								if (groqRes.ok) {
									const transcript = await groqRes.text();
									await supabaseAdmin.from('voicemails').update({ transcript }).eq('id', vm.id);
								}
							}
						}
					}
				} catch (err) { console.error('[voicemail-recording] error:', err); }
			})();
			return new Response('', { status: 200 });
		}

	return resolve(event);
};
