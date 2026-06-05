import { env } from '$env/dynamic/private';
import { supabaseAdmin } from './supabase';

/**
 * Downloads a Twilio recording and sends it to Groq Whisper for transcription,
 * then summarizes the transcript with Claude Haiku. Saves both to the calls table.
 */
export async function processCallRecording(callId: string, recordingUrl: string): Promise<void> {
	const { GROQ_API_KEY, ANTHROPIC_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = env;

	let transcript = '';
	let summary = '';

	try {
		// ── 1. Download the MP3 from Twilio (requires HTTP Basic auth) ──────────
		const authHeader = 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
		const audioRes = await fetch(`${recordingUrl}.mp3`, {
			headers: { Authorization: authHeader },
		});

		if (!audioRes.ok) {
			throw new Error(`Twilio audio download failed: ${audioRes.status} ${audioRes.statusText}`);
		}

		const audioBuffer = await audioRes.arrayBuffer();
		const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
		const audioFile = new File([audioBlob], 'recording.mp3', { type: 'audio/mpeg' });

		// ── 2. Transcribe with Groq Whisper ──────────────────────────────────────
		if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');

		const formData = new FormData();
		formData.append('file', audioFile);
		formData.append('model', 'whisper-large-v3');
		formData.append('response_format', 'text');

		const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
			method: 'POST',
			headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
			body: formData,
		});

		if (!groqRes.ok) {
			const err = await groqRes.text();
			throw new Error(`Groq transcription failed: ${groqRes.status} — ${err}`);
		}

		transcript = await groqRes.text();

		// ── 3. Summarize with Claude Haiku ───────────────────────────────────────
		if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');

		const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'x-api-key': ANTHROPIC_API_KEY,
				'anthropic-version': '2023-06-01',
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				model: 'claude-haiku-4-5-20251001',
				max_tokens: 200,
				messages: [{
					role: 'user',
					content: `Summarize this sales call in 1–2 sentences. Focus on the outcome and any clear next steps.\n\nTranscript:\n${transcript}`,
				}],
			}),
		});

		if (claudeRes.ok) {
			const claudeData = await claudeRes.json() as { content: Array<{ type: string; text: string }> };
			summary = claudeData.content[0]?.type === 'text' ? claudeData.content[0].text : '';
		} else {
			const err = await claudeRes.text();
			console.error('Claude summarization failed:', claudeRes.status, err);
			summary = '[Summary unavailable]';
		}

	} catch (err) {
		console.error('[AI processing error]', err);
		// Still save whatever we have so the UI doesn't hang forever
		if (!transcript) transcript = '[Transcription failed — check server logs]';
		if (!summary) summary = '[Summary unavailable]';
	}

	// ── 4. Persist to database ───────────────────────────────────────────────
	const { error: dbErr } = await supabaseAdmin
		.from('calls')
		.update({ raw_transcript: transcript, summary, processed_at: new Date().toISOString() })
		.eq('id', callId);

	if (dbErr) console.error('[AI] Failed to save transcript to DB:', dbErr);
	else console.log('[AI] Transcript + summary saved for call', callId);
}

/**
 * Scores a sales call 0-10 using Claude based on transcript analysis.
 */
export async function scoreCallQuality(
	callId: string,
	transcript: string,
	outcome: string | null
): Promise<void> {
	const { env } = await import('$env/dynamic/private');
	if (!env.ANTHROPIC_API_KEY || transcript.length < 50) return;

	const prompt = `Score this sales call on a scale of 0-10. Be concise.

Transcript:
${transcript.slice(0, 2000)}

Outcome: ${outcome ?? 'unknown'}

Return JSON only:
{
  "score": 0-10,
  "talkRatio": "agent % of conversation (e.g. 40%)",
  "tone": "professional/aggressive/passive/good",
  "nextSteps": "clear/unclear/none",
  "objectionHandling": "strong/weak/n/a",
  "summary": "one sentence on call quality"
}`;

	try {
		const res = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
			body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
		});
		if (!res.ok) return;
		const data = await res.json() as { content: Array<{type:string;text:string}> };
		const text = data.content[0]?.text ?? '{}';
		const match = text.match(/\{[\s\S]*\}/);
		if (!match) return;
		const parsed = JSON.parse(match[0]);
		await supabaseAdmin.from('calls').update({
			quality_score: Math.min(10, Math.max(0, Math.round(parsed.score ?? 5))),
			quality_breakdown: JSON.stringify(parsed),
		}).eq('id', callId);
	} catch { /* non-fatal */ }
}
