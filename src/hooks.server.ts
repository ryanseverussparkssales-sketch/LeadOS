import type { Handle, HandleServerError } from '@sveltejs/kit';
import { runDurable } from '$lib/server/durable';

// Twilio webhooks that are answered here in the hook (before resolve()), so their
// signature validation must live here too — the matching +server.ts routes never run.
const TWILIO_WEBHOOK_PATHS = new Set([
	'/api/twilio/voice', '/api/twilio/recording', '/api/twilio/status',
	'/api/phone/incoming', '/api/phone/forward-status', '/api/phone/voicemail-recording',
]);

export const handle: Handle = async ({ event, resolve }) => {
	const path   = event.url.pathname;
	const method = event.request.method;

	console.log(`[hooks] ${method} ${path}`);

	// Reject forged Twilio webhooks. Read a clone so the original body stream is
	// still available to the per-path handlers below.
	if (method === 'POST' && TWILIO_WEBHOOK_PATHS.has(path)) {
		const { verifyTwilioSignature } = await import('$lib/server/twilioVerify');
		const form = await event.request.clone().formData();
		const sigParams: Record<string, string> = {};
		for (const [k, v] of form.entries()) sigParams[k] = v as string;
		if (!(await verifyTwilioSignature(event.request, event.url, sigParams))) {
			return new Response('Forbidden', { status: 403 });
		}
	}

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
				// Await this — the recording/status callbacks look the call up BY twilio_call_sid,
				// so dropping this write on serverless would orphan the recording. It's one fast update.
				const { error } = await supabaseAdmin.from('calls')
					.update({ twilio_call_sid: callSid })
					.eq('id', callId);
				if (error) console.error('[voice] DB error:', error);
			}

			if (to && callerId) {
				// Force https — ngrok serves https but event.url.origin returns http
				const base = event.url.origin.replace('http://', 'https://');
				console.log('[voice] base URL:', base);
				const dialAttrs = {
					callerId,
					action: base + '/api/twilio/status',
					method: 'POST' as const,
					record: 'record-from-ringing' as const,
					recordingStatusCallback: base + '/api/twilio/recording',
					recordingStatusCallbackMethod: 'POST' as const,
				};
				if (env.TWILIO_AMD_ENABLED === 'true') {
					// AMD on the dialed leg → /api/twilio/amd drops a voicemail on machines.
					const dial = twiml.dial(dialAttrs);
					dial.number(
						{
							machineDetection: 'DetectMessageEnd',
							amdStatusCallback: base + '/api/twilio/amd',
							amdStatusCallbackMethod: 'POST',
						} as Parameters<typeof dial.number>[0],
						to,
					);
				} else {
					twiml.dial(dialAttrs, to);
				}
				console.log('[voice] TwiML:', twiml.toString());
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
		await runDurable((async () => {
			try {
				const { supabaseAdmin } = await import('$lib/server/supabase');
				const { processCallRecording } = await import('$lib/server/ai');
				const form = await event.request.clone().formData();
				const callSid      = form.get('CallSid') as string;
				const recordingUrl = form.get('RecordingUrl') as string;
				const status       = form.get('RecordingStatus') as string;
				// No recording (short / no-answer call) — mark processed so the dialer poller stops waiting.
				if (callSid && (status === 'absent' || status === 'failed')) {
					await supabaseAdmin.from('calls')
						.update({ summary: 'Recording unavailable', processed_at: new Date().toISOString() })
						.eq('twilio_call_sid', callSid);
				}
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
		})());
		return new Response('', { status: 200 });
	}

	if ((method === 'POST' || method === 'GET') && path === '/api/twilio/status') {
		await runDurable((async () => {
			try {
				const { supabaseAdmin } = await import('$lib/server/supabase');
				const form = await event.request.clone().formData();
				const callSid = form.get('CallSid') as string;
				const dur     = parseInt(form.get('DialCallDuration') as string ?? '0');
				const dialStatus = (form.get('DialCallStatus') as string ?? '').toLowerCase();
				const outcomeMap: Record<string, string> = {
					completed: 'answered', answered: 'answered', busy: 'busy',
					'no-answer': 'no_answer', failed: 'no_answer', canceled: 'no_answer',
				};
				const autoOutcome = outcomeMap[dialStatus];
				const { data: call } = await supabaseAdmin
					.from('calls').select('id, outcome').eq('twilio_call_sid', callSid).maybeSingle();
				if (call) {
					// Never overwrite an outcome the rep already logged.
					const repOutcomes = new Set(['appointment_set','demo_scheduled','meeting_confirmed','signed_up','callback','not_interested','do_not_call','follow_up_agreed','left_voicemail','wrong_number','info_requested','referral']);
					const updates: Record<string, unknown> = { ended_at: new Date().toISOString() };
					if (dur > 0) updates.call_duration_seconds = dur;
					if (autoOutcome && !repOutcomes.has(call.outcome ?? '')) updates.outcome = autoOutcome;
					await supabaseAdmin.from('calls').update(updates).eq('id', call.id);
				}
			} catch (err) { console.error('[status] error:', err); }
		})());
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

			// MINIMAL_COLS are guaranteed to exist; optional extras are fetched in FULL_COLS
			// and retried without on error. NEVER put migration-dependent columns in the only
			// select: a missing column errors the whole query, phoneRec comes back null, and
			// every inbound call silently falls through to client:agent → straight to
			// voicemail. (Exactly that took inbound down on 2026-06-05 — forwarding_*,
			// voicemail_enabled, ring_timeout_seconds didn't exist in prod.)
			const MINIMAL_COLS = 'id, user_id, phone_number, voicemail_greeting, record_incoming';
			const FULL_COLS = MINIMAL_COLS + ', forwarding_enabled, forwarding_number, voicemail_enabled, ring_timeout_seconds';

			const findByExact = async (cols: string) => {
				const { data, error } = await supabaseAdmin
					.from('phone_numbers').select(cols)
					.eq('phone_number', calledNum).eq('status', 'active').maybeSingle();
				if (error) console.error(`[incoming] phone_numbers lookup error (cols=${cols}):`, error.message);
				return { rec: data as any, err: error };
			};

			let { rec: phoneRec, err: lookupErr } = await findByExact(FULL_COLS);
			// Full select errored (e.g. not-yet-migrated column)? Retry with minimal columns
			// instead of treating it as "number not found".
			if (!phoneRec && lookupErr) ({ rec: phoneRec } = await findByExact(MINIMAL_COLS));

			// Format-tolerant fallback: if the exact string didn't match (e.g. the number
			// is stored as (484) 286-5470 vs +14842865470), match on the last 10 digits.
			if (!phoneRec) {
				const wanted = calledNum.replace(/\D/g, '').slice(-10);
				let { data: actives, error: activesErr } = (await supabaseAdmin
					.from('phone_numbers').select(FULL_COLS).eq('status', 'active')) as { data: any[] | null; error: any };
				if (activesErr) {
					console.error('[incoming] actives lookup error, retrying minimal:', activesErr.message);
					({ data: actives } = (await supabaseAdmin
						.from('phone_numbers').select(MINIMAL_COLS).eq('status', 'active')) as { data: any[] | null; error: any });
				}
				phoneRec = ((actives ?? []) as any[]).find(
					(p) => ((p.phone_number as string) ?? '').replace(/\D/g, '').slice(-10) === wanted
				) ?? null;
			}
			console.log('[incoming] called', calledNum, '→', phoneRec ? `owner ${phoneRec.user_id}` : 'NUMBER NOT FOUND in phone_numbers');

			// Record the inbound call so its recording/transcript can be correlated by
			// twilio_call_sid later. Isolated try/catch so a DB hiccup never breaks the call.
			const inCallSid = params['CallSid'];
			if (phoneRec?.user_id && inCallSid) {
				try {
					// Format-tolerant contact match: phone_normalized is stored WITH a leading
					// '+' (e.g. "+16124172133") while digits-only was being compared before —
					// that mismatch made every caller look unknown, and contact_id null then
					// violated the NOT NULL constraint, killing the insert. Match on the last
					// 10 digits so any stored format works.
					const callerLast10 = callerNum.replace(/\D/g, '').slice(-10);
					const { data: cMatches } = await supabaseAdmin
						.from('contacts').select('id')
						.eq('user_id', phoneRec.user_id)
						.like('phone_normalized', `%${callerLast10}`)
						.limit(1);
					const c = cMatches?.[0] ?? null;
					const { error: insErr } = await supabaseAdmin.from('calls').insert({
						user_id: phoneRec.user_id,
						phone_number_id: phoneRec.id,
						contact_id: c?.id ?? null,
						direction: 'inbound',
						call_type: 'inbound',
						phone_number: callerNum, // display column used by Recent Calls list
						from_number: callerNum,
						to_number: calledNum,
						twilio_call_sid: inCallSid,
						status: 'ringing',
						started_at: new Date().toISOString(),
					});
					if (insErr) console.error('[incoming] call row insert failed:', insErr.message);
				} catch (e) { console.error('[incoming] call row insert failed:', e); }
			}

			const VR = twilio.twiml.VoiceResponse;
			const twiml = new VR();

			if (phoneRec) {
				const ringTimeout = phoneRec.ring_timeout_seconds ?? 25;
				const { clientIdentityForUser } = await import('$lib/server/twilio');

				// Read the assigned rep separately + leniently, so a not-yet-migrated
				// `assigned_user_id` column can never break the number lookup (which would
				// send every inbound call straight to voicemail).
				let assignedUserId: string | null = null;
				const { data: assignRow } = await supabaseAdmin
					.from('phone_numbers').select('assigned_user_id').eq('id', phoneRec.id).maybeSingle();
				assignedUserId = (assignRow as { assigned_user_id?: string | null } | null)?.assigned_user_id ?? null;

				// Per-rep routing: ring the assigned rep's browser only. If the number has
				// no assigned rep, ring a group — the owner plus all active team members —
				// and the first to answer wins.
				let targets: string[];
				if (assignedUserId) {
					targets = [clientIdentityForUser(assignedUserId)];
				} else {
					const { data: reps } = await supabaseAdmin
						.from('team_members')
						.select('member_user_id')
						.eq('owner_user_id', phoneRec.user_id)
						.eq('status', 'active')
						.not('member_user_id', 'is', null);
					const ids = new Set<string>([phoneRec.user_id]);
					for (const r of reps ?? []) if (r.member_user_id) ids.add(r.member_user_id);
					targets = [...ids].map(clientIdentityForUser);
				}
				console.log('[incoming]', calledNum, '→ targets:', targets.join(', '), '| assigned:', assignedUserId ?? 'none');

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
					// Ring the targeted browser(s). Multiple <Client> nouns ring together;
					// action fires if nobody answers → goes to voicemail.
					const dial = twiml.dial({
						timeout: ringTimeout,
						action: base + '/api/phone/forward-status',
						method: 'POST',
						record: 'record-from-ringing',
						recordingStatusCallback: base + '/api/twilio/recording',
						recordingStatusCallbackMethod: 'POST',
					} as any);
					for (const t of targets) {
						const cl = dial.client({});
						cl.identity(t);
						// Surface the PARENT inbound CallSid to the browser — the answered
						// child leg has its own SID, so without this the Desk Phone can't
						// link the call back to the calls row created above.
						if (inCallSid) cl.parameter({ name: 'inboundCallSid', value: inCallSid });
					}
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
		await runDurable((async () => {
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
						}).then(() => {}, () => {});

						if (vm) {
							const { env } = await import('$env/dynamic/private');
							// BYOC: fetch the recording with the number owner's creds (falls back to env).
							const { getTwilioCreds, twilioBasicAuth } = await import('$lib/server/twilio');
							const vmCreds = await getTwilioCreds(phoneRec.user_id);
							const authHeader = vmCreds.hasRest
								? twilioBasicAuth(vmCreds)
								: 'Basic ' + Buffer.from(env.TWILIO_ACCOUNT_SID + ':' + env.TWILIO_AUTH_TOKEN).toString('base64');
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
				}
			} catch (err) { console.error('[voicemail-recording] error:', err); }
			})());
			return new Response('', { status: 200 });
		}

	return resolve(event);
};

// ── Optional Sentry reporting ────────────────────────────────────────────────
// Lazily initialized once, and ONLY if SENTRY_DSN is set AND @sentry/sveltekit
// is actually installed. The non-literal import specifier (+ @vite-ignore) keeps
// Vite from trying to resolve the package at build time, so the app builds and
// runs fine with the package uninstalled or the DSN unset. Any import/init
// failure resolves to null and we fall back silently to console logging.
type SentryLike = { captureException: (e: unknown, ctx?: Record<string, unknown>) => unknown };
let sentryPromise: Promise<SentryLike | null> | null = null;
function getSentry(): Promise<SentryLike | null> | null {
	if (!process.env.SENTRY_DSN) return null;
	if (!sentryPromise) {
		const pkg = '@sentry/sveltekit';
		sentryPromise = import(/* @vite-ignore */ pkg)
			.then((Sentry) => {
				Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0 });
				return Sentry as SentryLike;
			})
			.catch(() => null);
	}
	return sentryPromise;
}

// Capture otherwise-silent server errors (previously there was no handleError hook,
// so uncaught errors vanished). Logs a structured line + a reference id surfaced to
// the user. If SENTRY_DSN is set and @sentry/sveltekit is installed, the error is
// also reported to Sentry (fire-and-forget); console logging happens regardless.
export const handleError: HandleServerError = ({ error, event, status, message }) => {
	const ref = crypto.randomUUID().slice(0, 8);
	console.error(
		`[error] ref=${ref} ${event.request.method} ${event.url.pathname} → ${status} ${message}`,
		error,
	);
	try {
		getSentry()?.then((sentry) => {
			sentry?.captureException(error, {
				tags: { ref },
				extra: { path: event.url.pathname, method: event.request.method, status, message },
			});
		}).catch(() => { /* never let error reporting throw */ });
	} catch { /* never let error reporting throw */ }
	return { message: status >= 500 ? `Internal error (ref ${ref})` : message };
};
