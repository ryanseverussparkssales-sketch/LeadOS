/**
 * RogueOS — Twilio ConversationRelay AI voice-qualification agent.
 *
 * Twilio's ConversationRelay needs a PERSISTENT WebSocket server (the SvelteKit
 * app on Vercel can't host one). This standalone Node service is that server: it
 * receives the caller's transcribed speech, runs a Claude qualification loop, and
 * streams replies back for Twilio to speak (TTS). On hang-up it persists the
 * transcript + outcome to Supabase.
 *
 * Deploy separately (Railway / Render / Fly / a VPS). See README.md.
 *
 * Protocol: https://www.twilio.com/docs/voice/conversationrelay/websocket-messages
 *   Twilio → us:  setup | prompt | dtmf | interrupt | error
 *   us → Twilio:  { type:'text', token, last }  and  { type:'end', handoffData }
 */
import http from 'node:http';
import { WebSocketServer } from 'ws';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const PORT = process.env.PORT || 8080;
const MODEL = process.env.RELAY_MODEL || 'claude-haiku-4-5-20251001';
const SHARED_SECRET = process.env.RELAY_SHARED_SECRET || '';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
	auth: { autoRefreshToken: false, persistSession: false },
});

const SYSTEM_PROMPT = `You are a warm, concise voice assistant making an outbound sales-qualification call on behalf of RogueLeads. You are speaking on a PHONE call.

Rules:
- Keep every reply to 1–2 short, natural sentences. No bullet points, no markdown.
- First confirm you're speaking with the right person, then gauge interest and qualify lightly (need, rough timing, who makes the decision).
- If they're interested, offer to book a quick callback or appointment and confirm a day/time.
- If they ask for a human, sound annoyed, or it's a wrong number: acknowledge politely and wrap up.
- Never invent facts or make promises about pricing you don't know.
- When the call should end (qualified, not interested, wrong number, or they want a human), finish your spoken sentence, then on a NEW LINE output EXACTLY one marker: <<END outcome=OUTCOME>> where OUTCOME is one of: interested, not_interested, callback, wrong_number, human. The marker is for the system only — never say it out loud.`;

const OUTCOME_MAP = {
	interested: 'callback',
	callback: 'callback',
	not_interested: 'not_interested',
	wrong_number: 'wrong_number',
	human: null, // leave for the human who gets the transfer
};

// ── Practice mode: the AI role-plays a prospect so reps can rehearse ──────────
const PERSONAS = {
	default: 'a typical small-business prospect — busy but reachable, and mildly skeptical.',
	skeptical_cfo: 'a sharp, time-pressed CFO who pushes hard on price, ROI, and proof. Fair, but hard to impress.',
	busy_owner: 'a harried small-business owner who almost hangs up, gives short answers, and needs a compelling reason to stay on the line.',
	friendly_noncommittal: 'a warm, chatty prospect who is friendly but avoids committing and deflects with "just send me some info".',
	gatekeeper: 'an assistant/gatekeeper screening the call who resists putting the rep through to the decision-maker.',
};

function buyerPrompt(personaId) {
	const persona = PERSONAS[personaId] || PERSONAS.default;
	return `You are role-playing as a PROSPECT receiving a cold sales call, so a sales rep can practice. Stay fully in character as ${persona}

Rules:
- This is a phone call — keep every reply to 1–2 short, natural sentences.
- React realistically: raise genuine objections and ask the questions this persona would ask.
- Do NOT coach, break character, or reveal that you are an AI. You are the buyer.
- Make the rep work for it, but stay believable — if they handle objections well, warm up gradually.
- Never output any system markers or brackets.`;
}

const COACH_PROMPT = `You are an elite sales coach. The transcript is a PRACTICE cold call where "Agent" is the sales rep (a human) and "Prospect" is an AI role-playing a buyer. In 3–4 sentences give the rep specific, constructive feedback on their opener, discovery, objection handling, and close — then end with a score like "Score: 7/10". Be direct and useful.`;

/**
 * Validate Twilio's X-Twilio-Signature on the WebSocket handshake. Same scheme as
 * webhooks: base64(HMAC-SHA1(authToken, url)) — no params on a GET upgrade. Opt-in
 * (RELAY_VALIDATE_SIGNATURE=true); the shared-secret token is the primary auth.
 * Tries several URL reconstructions because proxies (Railway/Render) rewrite host/proto
 * and may add/drop the path slash — or set RELAY_PUBLIC_WSS_URL for an exact match.
 */
function validateTwilioUpgrade(req) {
	if (process.env.RELAY_VALIDATE_SIGNATURE !== 'true') return true;
	const authToken = process.env.TWILIO_AUTH_TOKEN;
	const sig = req.headers['x-twilio-signature'];
	if (!authToken || !sig) return false;

	const host = req.headers['x-forwarded-host'] || req.headers.host || '';
	const noSlash = req.url.replace(/^\/\?/, '?');
	const candidates = [
		process.env.RELAY_PUBLIC_WSS_URL,
		`wss://${host}${req.url}`, `wss://${host}${noSlash}`,
		`https://${host}${req.url}`, `https://${host}${noSlash}`,
	].filter(Boolean);

	for (const url of candidates) {
		const expected = crypto.createHmac('sha1', authToken).update(Buffer.from(url, 'utf-8')).digest('base64');
		try {
			if (sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return true;
		} catch { /* length mismatch */ }
	}
	console.error('[relay] X-Twilio-Signature validation failed', { path: req.url });
	return false;
}

const server = http.createServer((req, res) => {
	// Simple health check for the host's load balancer.
	if (req.url === '/health') { res.writeHead(200); res.end('ok'); return; }
	res.writeHead(426); res.end('Upgrade Required');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
	// Auth 1: shared-secret token embedded in the wss URL.
	if (SHARED_SECRET) {
		const u = new URL(req.url, 'http://localhost');
		if (u.searchParams.get('token') !== SHARED_SECRET) {
			ws.close(1008, 'unauthorized');
			return;
		}
	}
	// Auth 2 (opt-in): validate Twilio's X-Twilio-Signature on the handshake.
	if (!validateTwilioUpgrade(req)) {
		ws.close(1008, 'bad signature');
		return;
	}

	const session = {
		callSid: '', callId: '', contactName: '',
		mode: 'qualify', persona: 'default',
		history: [],      // Anthropic message list
		transcript: [],   // { role, text } for persistence
		outcome: null,
		busy: false,
		stream: null,     // in-flight Claude stream (for interrupt/abort)
	};

	ws.on('message', async (data) => {
		let msg;
		try { msg = JSON.parse(data.toString()); } catch { return; }

		switch (msg.type) {
			case 'setup':
				session.callSid = msg.callSid || '';
				session.callId = msg.customParameters?.callId || '';
				session.contactName = msg.customParameters?.contactName || '';
				session.mode = msg.customParameters?.mode || 'qualify';
				session.persona = msg.customParameters?.persona || 'default';
				console.log(`[relay] setup mode=${session.mode} callSid=${session.callSid} callId=${session.callId}`);
				break;

			case 'prompt':
				// `last` marks the end of the caller's utterance.
				if (msg.last && msg.voicePrompt && !session.busy) {
					session.busy = true;
					try { await runTurn(ws, session, msg.voicePrompt); }
					finally { session.busy = false; }
				}
				break;

			case 'interrupt':
				// Caller spoke over the agent — stop generating/speaking immediately.
				try { session.stream?.abort(); } catch { /* ignore */ }
				break;

			case 'error':
				console.error('[relay] twilio error:', msg.description);
				break;
		}
	});

	ws.on('close', () => { persistSession(session).catch((e) => console.error('[relay] persist:', e)); });
	ws.on('error', (e) => console.error('[relay] ws error:', e));
});

async function runTurn(ws, session, userText) {
	session.transcript.push({ role: 'user', text: userText });
	session.history.push({ role: 'user', content: userText });

	const send = (token, last) => ws.send(JSON.stringify({ type: 'text', token, last }));

	let full = '';      // raw model output (may contain the <<END>> marker)
	let sent = 0;       // chars of `full` already streamed to TTS
	let markerAt = -1;  // index where the <<END>> marker begins (we stop speaking there)
	let aborted = false;

	try {
		const systemPrompt = session.mode === 'practice' ? buyerPrompt(session.persona) : SYSTEM_PROMPT;
		const stream = anthropic.messages.stream({
			model: MODEL, max_tokens: 200, system: systemPrompt, messages: session.history,
		});
		session.stream = stream;
		for await (const ev of stream) {
			if (ev.type !== 'content_block_delta' || ev.delta?.type !== 'text_delta') continue;
			full += ev.delta.text;
			if (markerAt !== -1) continue; // marker has started — speak nothing further
			const idx = full.indexOf('<<');
			if (idx !== -1) {
				markerAt = idx;
				if (idx > sent) { send(full.slice(sent, idx), false); sent = idx; }
			} else {
				// Hold back any trailing '<' (could be the start of the marker).
				let end = full.length;
				while (end > sent && full[end - 1] === '<') end--;
				if (end > sent) { send(full.slice(sent, end), false); sent = end; }
			}
		}
	} catch (e) {
		if (e?.name === 'AbortError' || e?.name === 'APIUserAbortError' || /abort/i.test(e?.message ?? '')) {
			aborted = true;
		} else {
			console.error('[relay] claude stream error:', e);
			if (!full) full = "I'm sorry, I'm having trouble. Let me have someone follow up. <<END outcome=callback>>";
		}
	} finally {
		session.stream = null;
	}

	if (aborted) {
		send('', true); // caller interrupted — close the turn quietly and keep listening
		return;
	}

	const endMatch = full.match(/<<END\s+outcome=(\w+)>>/i);
	const spokenFull = full.replace(/<<END[^>]*>>/i, '').trim();

	// Flush remaining spoken text (before the marker) and mark the turn complete.
	const tail = markerAt === -1 ? full.slice(sent) : full.slice(sent, markerAt);
	send(tail.length ? tail : ' ', true);

	session.transcript.push({ role: 'assistant', text: spokenFull });
	session.history.push({ role: 'assistant', content: spokenFull });

	if (endMatch) {
		session.outcome = endMatch[1].toLowerCase();
		// End the session; handoffData reaches the TwiML `action` callback so the app
		// can transfer to a human / log the result.
		ws.send(JSON.stringify({
			type: 'end',
			handoffData: JSON.stringify({ outcome: session.outcome, contactName: session.contactName }),
		}));
	}
}

async function persistSession(session) {
	if (!session.callId && !session.callSid) return;
	const isPractice = session.mode === 'practice';

	// Label the transcript by who the human actually is. In QUALIFY the human is the
	// prospect (AI = agent); in PRACTICE the human is the rep (AI = the buyer persona).
	const transcriptText = session.transcript
		.map((t) => {
			const human = t.role === 'user';
			const who = isPractice ? (human ? 'Agent' : 'Prospect') : (human ? 'Prospect' : 'Agent');
			return `${who}: ${t.text}`;
		})
		.join('\n');

	const update = { raw_transcript: transcriptText, processed_at: new Date().toISOString() };

	if (isPractice) {
		// Generate coaching feedback for the rep from the practice transcript.
		let coaching = 'Practice call completed.';
		try {
			const res = await anthropic.messages.create({
				model: MODEL,
				max_tokens: 300,
				system: COACH_PROMPT,
				messages: [{ role: 'user', content: transcriptText || '(no conversation captured)' }],
			});
			coaching = res.content.find((b) => b.type === 'text')?.text ?? coaching;
		} catch (e) {
			console.error('[relay] coaching error:', e);
		}
		update.summary = coaching;
		update.outcome = 'practice';
	} else {
		update.summary = session.outcome ? `AI qualification → ${session.outcome}` : 'AI qualification call';
		const mapped = session.outcome ? OUTCOME_MAP[session.outcome] : undefined;
		if (mapped) update.outcome = mapped;
	}

	let q = supabase.from('calls').update(update);
	q = session.callId ? q.eq('id', session.callId) : q.eq('twilio_call_sid', session.callSid);
	const { error } = await q;
	if (error) console.error('[relay] supabase update:', error.message);
	else console.log(`[relay] persisted ${isPractice ? 'practice' : 'qualify'} call ${session.callId || session.callSid}`);
}

server.listen(PORT, () => console.log(`[relay] ConversationRelay WS server listening on :${PORT}`));
