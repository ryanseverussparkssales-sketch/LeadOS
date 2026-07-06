/**
 * Assistant engine abstraction (browser).
 *
 * Picks between a LOCAL Guppy runtime (if reachable on this machine) and the
 * CLOUD Anthropic fallback route (`/api/assistant/stream`). Both engines speak
 * the same SSE contract so the UI has a single parser:
 *
 *   data: {"source":"cloud:claude-sonnet-4-5"}\n\n   (once, early — optional)
 *   data: {"tool":"search_contacts"}\n\n             (tool-use chip — optional)
 *   data: {"token":"..."}\n\n                        (streamed text)
 *   data: [DONE]\n\n                                 (terminal)
 *   data: {"error":"..."}\n\n  then  [DONE]          (on failure)
 *
 * This file is CLIENT code only — it must never import `$lib/server/*`.
 */
import { supabase } from '$lib/services/auth';

/** Base URL of the local Guppy runtime. Overridable via PUBLIC_GUPPY_URL. */
const GUPPY_URL: string =
	(import.meta.env.PUBLIC_GUPPY_URL as string | undefined) ?? 'http://127.0.0.1:8080';

export type EngineMode = 'local' | 'cloud';

export interface StreamHandlers {
	onToken(t: string): void;
	onSource(s: string): void;
	onToolChip(name: string): void;
	onDone(): void;
	onError(e: string): void;
}

export interface StreamOpts {
	signal?: AbortSignal;
	localToken?: string;
	model?: string;
}

/** An attached image on a user turn (vision input). */
export interface ChatImage {
	/** e.g. 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' */
	mediaType: string;
	/** Raw base64 (NO `data:...;base64,` prefix). */
	dataBase64: string;
}

/**
 * A chat turn. User turns may optionally carry `images` for vision input.
 * Text-only turns are unchanged (no `images` key), so existing callers work
 * without modification. The exact wire contract for images between this engine
 * and the cloud route is `{ mediaType, dataBase64 }` (mapped server-side to the
 * Anthropic block fields `media_type` / `data`).
 */
type ChatMessage = { role: 'user' | 'assistant'; content: string; images?: ChatImage[] };

// ── Engine probe (cached ~30s) ──────────────────────────────────────────────

const PROBE_TTL_MS = 30_000;
let _probeResult: EngineMode | null = null;
let _probeAt = 0;

/** Force the next probeEngine() call to re-check the local runtime. */
export function resetEngineProbe(): void {
	_probeResult = null;
	_probeAt = 0;
}

/**
 * Detect whether the local Guppy runtime is up. GET `${GUPPY_URL}/health` with a
 * short timeout — 200 ⇒ 'local', anything else (or a throw) ⇒ 'cloud'. Result is
 * cached for PROBE_TTL_MS so we don't probe on every keystroke/send.
 */
export async function probeEngine(): Promise<EngineMode> {
	const now = Date.now();
	if (_probeResult && now - _probeAt < PROBE_TTL_MS) return _probeResult;

	let mode: EngineMode = 'cloud';
	try {
		const res = await fetch(`${GUPPY_URL}/health`, {
			method: 'GET',
			signal: AbortSignal.timeout(1200),
		});
		mode = res.ok ? 'local' : 'cloud';
	} catch {
		mode = 'cloud';
	}

	_probeResult = mode;
	_probeAt = now;
	return mode;
}

// ── Shared SSE parser ───────────────────────────────────────────────────────

/**
 * Read an SSE response body and dispatch events to the handlers. Returns:
 *  - 'done'  — clean [DONE] or normal EOF
 *  - 'error' — an {"error"} event was seen (already dispatched)
 *  - 'empty-error' — the stream failed before ANY token was produced (used by
 *                    the local path to decide whether to fall through to cloud)
 *
 * `onError`/`onDone` are NOT called here for the local path's fall-through
 * decision; the caller drives terminal handler calls based on the return value.
 */
async function pumpSSE(
	res: Response,
	handlers: Pick<StreamHandlers, 'onToken' | 'onSource' | 'onToolChip'>,
	signal?: AbortSignal,
): Promise<{ status: 'done' | 'error' | 'empty-error'; error?: string; sawToken: boolean }> {
	if (!res.body) {
		return { status: 'empty-error', error: `No response body (HTTP ${res.status})`, sawToken: false };
	}
	if (!res.ok) {
		return { status: 'empty-error', error: `HTTP ${res.status}`, sawToken: false };
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	let sawToken = false;

	const handleData = (data: string): { terminal?: 'done' | 'error'; error?: string } => {
		const trimmed = data.trim();
		if (!trimmed) return {};
		if (trimmed === '[DONE]') return { terminal: 'done' };

		let obj: Record<string, unknown>;
		try {
			obj = JSON.parse(trimmed);
		} catch {
			return {}; // ignore non-JSON keepalive/comment lines
		}

		if (typeof obj.error === 'string') {
			return { terminal: 'error', error: obj.error };
		}
		if (typeof obj.token === 'string') {
			sawToken = true;
			handlers.onToken(obj.token);
			return {};
		}
		if (typeof obj.source === 'string') {
			handlers.onSource(obj.source);
			return {};
		}
		// Tool chip: cloud emits {"tool"}; Guppy may emit {"tool"} or {"tool_exec"}.
		const toolName =
			typeof obj.tool === 'string' ? obj.tool :
			typeof obj.tool_exec === 'string' ? obj.tool_exec : null;
		if (toolName) {
			handlers.onToolChip(toolName);
			return {};
		}
		return {};
	};

	try {
		for (;;) {
			if (signal?.aborted) {
				try { await reader.cancel(); } catch { /* ignore */ }
				return { status: 'done', sawToken };
			}
			const { value, done } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });

			// SSE events are separated by a blank line.
			let sep: number;
			while ((sep = buffer.indexOf('\n\n')) !== -1) {
				const rawEvent = buffer.slice(0, sep);
				buffer = buffer.slice(sep + 2);

				// An event may have multiple `data:` lines; concatenate them.
				let dataPayload = '';
				for (const line of rawEvent.split('\n')) {
					const l = line.replace(/\r$/, '');
					if (l.startsWith('data:')) dataPayload += l.slice(5).replace(/^ /, '');
				}
				if (!dataPayload) continue;

				const r = handleData(dataPayload);
				if (r.terminal === 'done') return { status: 'done', sawToken };
				if (r.terminal === 'error') return { status: 'error', error: r.error, sawToken };
			}
		}

		// Flush any trailing buffered event without a terminating blank line.
		const tail = buffer.trim();
		if (tail) {
			for (const line of tail.split('\n')) {
				const l = line.replace(/\r$/, '');
				if (l.startsWith('data:')) {
					const r = handleData(l.slice(5).replace(/^ /, ''));
					if (r.terminal === 'error') return { status: 'error', error: r.error, sawToken };
				}
			}
		}

		return { status: 'done', sawToken };
	} catch (e) {
		if (signal?.aborted) return { status: 'done', sawToken };
		const error = e instanceof Error ? e.message : 'Stream read failed';
		return { status: sawToken ? 'error' : 'empty-error', error, sawToken };
	}
}

// ── Public streaming entrypoint ─────────────────────────────────────────────

/**
 * Stream a chat completion, auto-selecting local vs cloud.
 *
 * LOCAL failures that happen BEFORE any token arrives transparently fall
 * through to the cloud route (and reset the probe cache). Once tokens have
 * streamed, an error is surfaced as-is (no double-answer).
 */
export async function streamChat(
	messages: ChatMessage[],
	handlers: StreamHandlers,
	opts: StreamOpts = {},
): Promise<void> {
	const { signal } = opts;

	// Vision input: if the latest user turn carries images, ALWAYS use the cloud
	// route (Claude vision) regardless of the local probe. Local Guppy vision is a
	// separate endpoint we don't call from here, so we skip local for image turns.
	const lastTurn = messages[messages.length - 1];
	const hasImages = !!lastTurn?.images && lastTurn.images.length > 0;

	const mode: EngineMode = hasImages ? 'cloud' : await probeEngine();

	if (hasImages) {
		handlers.onSource('cloud:claude (vision)');
	}

	if (mode === 'local') {
		try {
			const headers: Record<string, string> = { 'Content-Type': 'application/json' };
			if (opts.localToken) headers['Authorization'] = `Bearer ${opts.localToken}`;

			const res = await fetch(`${GUPPY_URL}/chat/stream`, {
				method: 'POST',
				headers,
				body: JSON.stringify({ messages, surface: 'companion' }),
				signal,
			});

			const result = await pumpSSE(res, handlers, signal);

			if (result.status === 'done') {
				handlers.onDone();
				return;
			}
			if (result.status === 'error' && result.sawToken) {
				// Already streamed content — surface the error, don't re-answer.
				handlers.onError(result.error ?? 'Local assistant error');
				handlers.onDone();
				return;
			}
			// Failed before any token → fall through to cloud below.
			resetEngineProbe();
			handlers.onSource('cloud:claude-sonnet-4-5 (local unavailable)');
		} catch (e) {
			if (signal?.aborted) { handlers.onDone(); return; }
			// Local fetch threw outright → fall through to cloud.
			resetEngineProbe();
			handlers.onSource('cloud:claude-sonnet-4-5 (local unavailable)');
		}
	}

	// CLOUD path — authenticate with the same Supabase bearer apiFetch uses.
	try {
		const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
		try {
			const { data: { session } } = await supabase.auth.getSession();
			const token = session?.access_token;
			if (token) authHeaders['Authorization'] = `Bearer ${token}`;
		} catch { /* unauthenticated — the route will 401, handled below */ }

		const res = await fetch('/api/assistant/stream', {
			method: 'POST',
			headers: authHeaders,
			body: JSON.stringify({ messages, model: opts.model }),
			signal,
		});

		const result = await pumpSSE(res, handlers, signal);
		if (result.status === 'error') {
			handlers.onError(result.error ?? 'Assistant error');
		}
		handlers.onDone();
	} catch (e) {
		if (signal?.aborted) { handlers.onDone(); return; }
		handlers.onError(e instanceof Error ? e.message : 'Assistant request failed');
		handlers.onDone();
	}
}
