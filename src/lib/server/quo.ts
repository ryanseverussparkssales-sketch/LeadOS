/**
 * Quo (formerly OpenPhone) calling integration.
 *
 * Mirrors the working Guppy implementation (routes_voip.py):
 *   - Base URL      https://api.openphone.com
 *   - Auth header   Authorization: <QUO_API_KEY>   (NO "Bearer " prefix)
 *   - Calls list    GET /calls?phoneNumberId=...&maxResults=...
 *   - Webhook sig   header "openphone-signature", format
 *                     "hmac;1;{unix_ts};{base64sig}"
 *                   verified as HMAC-SHA256 over `${timestamp}.${rawBody}`
 *                   with a base64-DECODED QUO_WEBHOOK_SECRET.
 *
 * Everything honest-fails (returns null / [] + one console line) when the
 * relevant env var is unset — no throw, so callers stay non-fatal.
 *
 * Environment:
 *   QUO_API_KEY          — Quo API key (Settings → API in Quo)
 *   QUO_PHONE_NUMBER_ID  — Quo phone number id (format: PN...)
 *   QUO_WEBHOOK_SECRET   — Webhook signing secret (base64, Settings → Webhooks)
 *   GROQ_API_KEY         — Groq Whisper transcription (shared with ai.ts)
 *   ANTHROPIC_API_KEY    — Claude Haiku summarization (shared with ai.ts)
 */

import { env } from '$env/dynamic/private';
import { createHmac, timingSafeEqual } from 'crypto';
import { normalizePhone } from '$lib/utils/phone';
import { supabaseAdmin } from './supabase';

export const QUO_API_BASE = 'https://api.openphone.com';

// ── env getters ──────────────────────────────────────────────────────────────

export function quoApiKey(): string {
	return (env.QUO_API_KEY ?? '').trim();
}

export function quoPhoneNumberId(): string {
	return (env.QUO_PHONE_NUMBER_ID ?? '').trim();
}

export function quoWebhookSecret(): string {
	return (env.QUO_WEBHOOK_SECRET ?? '').trim();
}

export function quoConfigured(): boolean {
	return Boolean(quoApiKey() && quoPhoneNumberId());
}

// ── webhook signature ────────────────────────────────────────────────────────

/**
 * Verify a Quo/OpenPhone webhook signature.
 *
 * Header format: "hmac;1;{unix_timestamp};{base64_signature}"
 * Signed message: "{timestamp}.{rawBody}"
 * Key: base64-decoded QUO_WEBHOOK_SECRET.
 *
 * Fail-closed: returns false when the secret is unset or anything is malformed.
 * Mirrors Guppy `_verify_quo_signature` exactly.
 */
export function verifyQuoSignature(rawBody: string, signatureHeader: string): boolean {
	const secret = quoWebhookSecret();
	if (!secret) return false; // cannot verify authenticity without a secret
	try {
		const parts = (signatureHeader ?? '').split(';');
		if (parts.length !== 4 || parts[0] !== 'hmac') return false;
		const timestamp = parts[2];
		const providedSig = parts[3];
		if (!timestamp || !providedSig) return false;

		const key = Buffer.from(secret, 'base64');
		const message = `${timestamp}.${rawBody}`;
		const expected = createHmac('sha256', key).update(message, 'utf8').digest('base64');

		// Constant-time compare (guard against length-mismatch throw in timingSafeEqual).
		const a = Buffer.from(expected);
		const b = Buffer.from(providedSig);
		if (a.length !== b.length) return false;
		return timingSafeEqual(a, b);
	} catch (err) {
		console.error('[quo] signature verification error:', err instanceof Error ? err.message : err);
		return false;
	}
}

// ── Quo REST API ─────────────────────────────────────────────────────────────

/** A raw Quo/OpenPhone call object (subset of the fields we consume). */
export interface QuoCall {
	id: string;
	direction?: string; // "incoming" | "outgoing"
	status?: string;    // completed | missed | no-answer | voicemail | ...
	duration?: number;  // seconds
	createdAt?: string;
	completedAt?: string;
	answeredAt?: string;
	phoneNumberId?: string;
	participants?: Array<{ phoneNumber?: string; direction?: string }>;
	// Recording surfaced inline on some payloads:
	media?: Array<{ url?: string; type?: string }>;
	[key: string]: unknown;
}

/**
 * Pull recent calls from the Quo REST API for the configured phone number.
 * Honest-fail → returns [] when QUO_API_KEY / QUO_PHONE_NUMBER_ID are unset,
 * or on any HTTP / network error (logs one line).
 */
export async function fetchQuoCalls(maxResults = 50): Promise<QuoCall[]> {
	const apiKey = quoApiKey();
	const phoneId = quoPhoneNumberId();
	if (!apiKey || !phoneId) {
		console.warn('[quo] fetchQuoCalls skipped — QUO_API_KEY / QUO_PHONE_NUMBER_ID not set');
		return [];
	}
	const qs = new URLSearchParams({
		phoneNumberId: phoneId,
		maxResults: String(Math.min(Math.max(maxResults, 1), 100)),
	});
	const url = `${QUO_API_BASE}/calls?${qs.toString()}`;
	try {
		const res = await fetch(url, {
			headers: { Authorization: apiKey, Accept: 'application/json' },
		});
		if (!res.ok) {
			console.error('[quo] fetchQuoCalls HTTP error:', res.status, await res.text().catch(() => ''));
			return [];
		}
		const body = (await res.json()) as { data?: QuoCall[] };
		return Array.isArray(body?.data) ? body.data : [];
	} catch (err) {
		console.error('[quo] fetchQuoCalls network error:', err instanceof Error ? err.message : err);
		return [];
	}
}

/**
 * Resolve a downloadable recording URL for a call.
 *
 * ASSUMPTION: Guppy's integration does NOT resolve recordings — it only lists
 * calls. OpenPhone/Quo exposes recordings via `GET /call-recordings/{callId}`,
 * which returns `{ data: [{ url, ... }] }`. We call that endpoint and return the
 * first media URL. If a caller already has the call object with inline `media`,
 * pass it to skip the round-trip. Returns null (honest-fail) when unconfigured,
 * on error, or when no recording exists.
 */
export async function fetchQuoRecordingUrl(callId: string, call?: QuoCall): Promise<string | null> {
	// Inline media on the call object (cheapest path).
	if (call?.media && Array.isArray(call.media)) {
		const inline = call.media.find((m) => typeof m?.url === 'string' && m.url);
		if (inline?.url) return inline.url;
	}

	const apiKey = quoApiKey();
	if (!apiKey) {
		console.warn('[quo] fetchQuoRecordingUrl skipped — QUO_API_KEY not set');
		return null;
	}
	const url = `${QUO_API_BASE}/call-recordings/${encodeURIComponent(callId)}`;
	try {
		const res = await fetch(url, {
			headers: { Authorization: apiKey, Accept: 'application/json' },
		});
		if (!res.ok) {
			// 404 = no recording for this call; anything else is a real error we log.
			if (res.status !== 404) {
				console.error('[quo] fetchQuoRecordingUrl HTTP error:', res.status, await res.text().catch(() => ''));
			}
			return null;
		}
		const body = (await res.json()) as {
			data?: Array<{ url?: string }> | { url?: string };
		};
		if (Array.isArray(body?.data)) {
			const rec = body.data.find((r) => typeof r?.url === 'string' && r.url);
			return rec?.url ?? null;
		}
		if (body?.data && typeof (body.data as { url?: string }).url === 'string') {
			return (body.data as { url?: string }).url ?? null;
		}
		return null;
	} catch (err) {
		console.error('[quo] fetchQuoRecordingUrl network error:', err instanceof Error ? err.message : err);
		return null;
	}
}

// ── transcription (reuses the ai.ts Groq→Claude approach) ─────────────────────

/**
 * Download a Quo call recording, transcribe with Groq Whisper, summarize with
 * Claude Haiku, and persist raw_transcript / summary / processed_at onto the
 * calls row. Non-fatal: swallows errors, always leaves the row in a sane state.
 *
 * This replicates ai.ts `processCallRecording` but handles Quo's auth (the
 * recording download needs the QUO_API_KEY header, whereas Twilio recordings use
 * HTTP Basic with the tenant's Twilio creds). `ownerId` is used only to scope the
 * final UPDATE defensively.
 */
export async function transcribeQuoCall(
	callRowId: string,
	recordingUrl: string,
	ownerId: string,
): Promise<void> {
	const { GROQ_API_KEY, ANTHROPIC_API_KEY } = env;
	let transcript = '';
	let summary = '';

	try {
		// ── 1. Download the recording (Quo media needs the API key) ──────────────
		const audioRes = await fetch(recordingUrl, {
			headers: { Authorization: quoApiKey() },
		});
		if (!audioRes.ok) {
			throw new Error(`Quo audio download failed: ${audioRes.status} ${audioRes.statusText}`);
		}
		const audioBuffer = await audioRes.arrayBuffer();
		const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
		const audioFile = new File([audioBlob], 'recording.mp3', { type: 'audio/mpeg' });

		// ── 2. Transcribe with Groq Whisper (same model/endpoint as ai.ts) ───────
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
			const errText = await groqRes.text();
			throw new Error(`Groq transcription failed: ${groqRes.status} — ${errText}`);
		}
		transcript = await groqRes.text();

		// ── 3. Summarize with Claude Haiku (same model/pattern as ai.ts) ─────────
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
				messages: [
					{
						role: 'user',
						content: `Summarize this sales call in 1–2 sentences. Focus on the outcome and any clear next steps.\n\nTranscript:\n${transcript}`,
					},
				],
			}),
		});
		if (claudeRes.ok) {
			const claudeData = (await claudeRes.json()) as {
				content: Array<{ type: string; text: string }>;
			};
			summary = claudeData.content[0]?.type === 'text' ? claudeData.content[0].text : '';
		} else {
			console.error('[quo] Claude summarization failed:', claudeRes.status, await claudeRes.text().catch(() => ''));
			summary = '[Summary unavailable]';
		}
	} catch (err) {
		console.error('[quo] transcribeQuoCall error:', err instanceof Error ? err.message : err);
		if (!transcript) transcript = '[Transcription failed — check server logs]';
		if (!summary) summary = '[Summary unavailable]';
	}

	// ── 4. Persist (owner-scoped) ────────────────────────────────────────────────
	const { error: dbErr } = await supabaseAdmin
		.from('calls')
		.update({ raw_transcript: transcript, summary, processed_at: new Date().toISOString() })
		.eq('id', callRowId)
		.eq('user_id', ownerId);
	if (dbErr) console.error('[quo] failed to save transcript to DB:', dbErr.message);
	else console.log('[quo] transcript + summary saved for call', callRowId);
}

// ── shared upsert helpers (webhook + sync share these) ────────────────────────

/** Map a Quo call status to the calls.outcome / status text we store. */
export function quoOutcome(call: QuoCall): string {
	const s = (call.status ?? '').toLowerCase();
	if (s === 'completed' || s === 'answered') return 'completed';
	if (s === 'missed' || s === 'no-answer' || s === 'noanswer') return 'missed';
	if (s === 'voicemail') return 'voicemail';
	if (s === 'failed') return 'failed';
	return s || 'completed';
}

/** The counterparty phone number (first participant that isn't our own line). */
export function quoCounterpartyNumber(call: QuoCall): string {
	const participants = Array.isArray(call.participants) ? call.participants : [];
	const other = participants.find((p) => p?.direction !== 'self' && p?.phoneNumber);
	return (other?.phoneNumber ?? participants[0]?.phoneNumber ?? '') || '';
}

/** Quo "incoming" → inbound, everything else → outbound. */
export function quoDirection(call: QuoCall): string {
	return (call.direction ?? '').toLowerCase() === 'incoming' ? 'inbound' : 'outbound';
}

/**
 * Match a raw counterparty number to a contact for `ownerId` (best-effort).
 * Tries the normalized column first (like the email route uses email_normalized),
 * then the raw `phone` column. Owner-scoped. Returns null when no match.
 */
export async function matchQuoContact(ownerId: string, rawNumber: string): Promise<string | null> {
	if (!rawNumber) return null;
	const normalized = normalizePhone(rawNumber);

	const { data: byNorm } = await supabaseAdmin
		.from('contacts')
		.select('id')
		.eq('user_id', ownerId)
		.eq('phone_normalized', normalized)
		.is('deleted_at', null)
		.limit(1)
		.maybeSingle();
	if (byNorm?.id) return byNorm.id;

	const { data: byPhone } = await supabaseAdmin
		.from('contacts')
		.select('id')
		.eq('user_id', ownerId)
		.eq('phone', normalized)
		.is('deleted_at', null)
		.limit(1)
		.maybeSingle();
	return byPhone?.id ?? null;
}

/**
 * Upsert a Quo call into public.calls keyed on (user_id, provider='quo',
 * provider_call_id). Owner-scoped throughout. Resolves the recording URL and
 * matches a contact. Returns the row id plus recording/transcript state so the
 * caller can decide whether to fire transcription.
 *
 * Shared by both the webhook and the /sync endpoint so upsert semantics stay
 * identical (no double-insert across the two paths).
 */
export async function upsertQuoCall(
	ownerId: string,
	call: QuoCall,
): Promise<{ rowId: string | null; recordingUrl: string | null; hasTranscript: boolean }> {
	const providerCallId = call.id;
	const counterparty = quoCounterpartyNumber(call);
	const contactId = await matchQuoContact(ownerId, counterparty);
	const recordingUrl = await fetchQuoRecordingUrl(providerCallId, call);

	const startedAt = call.answeredAt ?? call.createdAt ?? null;
	const endedAt = call.completedAt ?? null;

	const { data: existing } = await supabaseAdmin
		.from('calls')
		.select('id, raw_transcript')
		.eq('user_id', ownerId)
		.eq('provider', 'quo')
		.eq('provider_call_id', providerCallId)
		.limit(1)
		.maybeSingle();

	const rowPayload: Record<string, unknown> = {
		user_id: ownerId,
		contact_id: contactId,
		provider: 'quo',
		provider_call_id: providerCallId,
		phone_number: counterparty || null,
		direction: quoDirection(call),
		outcome: quoOutcome(call),
		status: (call.status ?? '').toLowerCase() || null,
		call_duration_seconds: typeof call.duration === 'number' ? call.duration : null,
		started_at: startedAt,
		ended_at: endedAt,
		recording_url: recordingUrl,
	};

	if (existing?.id) {
		await supabaseAdmin
			.from('calls')
			.update(rowPayload)
			.eq('id', existing.id)
			.eq('user_id', ownerId);
		return {
			rowId: existing.id,
			recordingUrl,
			hasTranscript: Boolean(existing.raw_transcript),
		};
	}

	const { data: inserted, error } = await supabaseAdmin
		.from('calls')
		.insert(rowPayload)
		.select('id')
		.single();
	if (error) {
		console.error('[quo] upsertQuoCall insert failed:', error.message);
		return { rowId: null, recordingUrl, hasTranscript: false };
	}
	return { rowId: inserted.id, recordingUrl, hasTranscript: false };
}
