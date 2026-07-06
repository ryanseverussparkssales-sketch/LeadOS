/**
 * Cloud assistant streaming route — Anthropic Claude with full CRM tool-use.
 *
 * The browser assistant engine (`$lib/assistant/engine.ts`) falls back to this
 * endpoint when the local Guppy runtime is unreachable. It speaks the shared
 * SSE contract:
 *
 *   data: {"source":"cloud:claude-sonnet-4-5"}\n\n   (once, early)
 *   data: {"tool":"search_contacts"}\n\n             (chip, per tool_use)
 *   data: {"token":"..."}\n\n                        (streamed text deltas)
 *   data: [DONE]\n\n                                 (terminal)
 *   data: {"error":"..."}\n\n  then  data: [DONE]\n\n (on failure)
 *
 * Auth mirrors the MCP route: session JWT OR `ldo_` personal token. Write-gating
 * is derived from the token scopes and passed into `runCrmTool`, which the tool
 * registry enforces per-tool.
 */
import { requireAuth, getEffectiveUserId } from '$lib/server/supabase';
import { assertAiAccess } from '$lib/server/tier';
import { rateLimit } from '$lib/server/rateLimit';
import { anthropicToolSpecs, runCrmTool, type ToolCtx } from '$lib/server/crmTools';
import { BRAND } from '$lib/brand';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const DEFAULT_MODEL = 'claude-sonnet-4-5';
const MAX_TOOL_ITERATIONS = 5;
const MAX_TURNS = 20;

/** Vision image on a user turn. Wire contract mirrors the engine (`$lib/assistant/engine.ts`). */
type ChatImage = { mediaType: string; dataBase64: string };
type ChatMessage = { role: 'user' | 'assistant'; content: string; images?: ChatImage[] };

// Vision limits (enforced server-side; the client also pre-enforces the count/size).
const MAX_IMAGES_PER_TURN = 4;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
// ~5MB per image. base64 inflates by ~4/3, so cap the base64 string length accordingly.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_B64_LEN = Math.ceil(MAX_IMAGE_BYTES * 4 / 3);

/** Validate a turn's images. Returns an error string, or null when OK. */
function validateImages(images: ChatImage[] | undefined): string | null {
	if (!images || images.length === 0) return null;
	if (images.length > MAX_IMAGES_PER_TURN) {
		return `Too many images: max ${MAX_IMAGES_PER_TURN} per message.`;
	}
	for (const img of images) {
		if (!img || typeof img.mediaType !== 'string' || typeof img.dataBase64 !== 'string') {
			return 'Malformed image attachment.';
		}
		if (!ALLOWED_IMAGE_TYPES.has(img.mediaType)) {
			return `Unsupported image type: ${img.mediaType}. Use PNG, JPEG, WebP, or GIF.`;
		}
		if (img.dataBase64.length === 0 || img.dataBase64.length > MAX_IMAGE_B64_LEN) {
			return 'Image too large: max 5MB each.';
		}
	}
	return null;
}

const enc = new TextEncoder();
const sse = (obj: unknown) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);
const sseDone = () => enc.encode('data: [DONE]\n\n');

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	// Auth first (401 before any work), mirroring the MCP route.
	const user = await requireAuth(request);
	await assertAiAccess(user.id);
	const ownerId = await getEffectiveUserId(user.id);
	const scopes = (user as { token_scopes?: string[] }).token_scopes; // undefined ⇒ session JWT ⇒ full access
	const canWrite = !scopes || scopes.includes('write');

	// Burst damping per identity + IP.
	let ip = 'unknown';
	try { ip = getClientAddress(); } catch { /* adapter-dependent */ }
	const rl = rateLimit(`assistant:${ownerId}:${ip}`, 120, 60_000);
	if (!rl.ok) {
		return new Response('Rate limited', {
			status: 429,
			headers: { 'Retry-After': String(rl.retryAfterSeconds ?? 60) },
		});
	}

	let body: { messages?: ChatMessage[]; model?: string };
	try {
		body = await request.json();
	} catch {
		return new Response('Invalid JSON body', { status: 400 });
	}

	const rawMessages = Array.isArray(body.messages) ? body.messages : [];
	const trimmed = rawMessages
		.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
		.slice(-MAX_TURNS);

	// Validate any image attachments up front → 400 before streaming.
	for (const m of trimmed) {
		const err = validateImages(m.images);
		if (err) return new Response(err, { status: 400 });
	}

	// Map to Anthropic message params. A user turn with images becomes a content
	// block array: [image blocks…, {type:'text'}]. Text-only turns stay strings.
	const messages: Anthropic.MessageParam[] = trimmed.map((m) => {
		if (m.role === 'user' && m.images && m.images.length > 0) {
			const blocks: Anthropic.ContentBlockParam[] = m.images.map((img) => ({
				type: 'image',
				source: { type: 'base64', media_type: img.mediaType as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif', data: img.dataBase64 },
			}));
			if (m.content.trim()) {
				blocks.push({ type: 'text', text: m.content });
			}
			return { role: m.role, content: blocks };
		}
		return { role: m.role, content: m.content };
	});

	if (messages.length === 0) {
		return new Response('No messages', { status: 400 });
	}

	// Vision turn? (latest user turn carried images) — reflected in the source badge.
	const lastRaw = [...trimmed].reverse().find((m) => m.role === 'user');
	const isVisionTurn = !!lastRaw?.images && lastRaw.images.length > 0;

	const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : DEFAULT_MODEL;

	const today = new Date().toLocaleDateString('en-US', {
		weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
	});

	const system = `You are the AI assistant embedded in ${BRAND}, a sales CRM and power-dialer platform.
Today's date: ${today}.

You have tools to read and act on the user's CRM data: search contacts, log calls, create tasks, book appointments, add deals, summarize the pipeline, and review today's agenda. ALWAYS use these tools to answer questions about the user's contacts, calls, tasks, appointments, deals, or pipeline — never guess or make up CRM data.

Guidance:
- Resolve a contact with search_contacts to get its id before calling any contact-linked tool (log_call, create_appointment, deal/task with a contact).
- Before any destructive or irreversible write (logging do_not_call, creating records the user did not clearly ask for), briefly confirm intent with the user rather than acting unilaterally.
- Be direct and concise. Use markdown when it aids readability. Report tool results plainly; do not dump raw JSON.
- If a tool returns an error (e.g. a write blocked by a read-only token), explain it to the user instead of retrying blindly.`;

	const ctx: ToolCtx = { ownerId, canWrite };
	const tools = anthropicToolSpecs();

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			let closed = false;
			const safeEnqueue = (chunk: Uint8Array) => {
				if (closed) return;
				try { controller.enqueue(chunk); } catch { closed = true; }
			};
			const finish = () => {
				if (closed) return;
				try { controller.enqueue(sseDone()); } catch { /* ignore */ }
				try { controller.close(); } catch { /* ignore */ }
				closed = true;
			};

			try {
				// Announce the routing source once, before the first token.
				safeEnqueue(sse({ source: isVisionTurn ? `cloud:${model} (vision)` : `cloud:${model}` }));

				const convo: Anthropic.MessageParam[] = [...messages];

				for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
					const ms = anthropic.messages.stream({
						model,
						max_tokens: 2048,
						system,
						tools,
						messages: convo,
					});

					// Forward text deltas live as they arrive.
					ms.on('text', (delta: string) => {
						if (delta) safeEnqueue(sse({ token: delta }));
					});

					// Wait for the full structured message (stop_reason + content blocks).
					const finalMessage = await ms.finalMessage();

					const toolUses = finalMessage.content.filter(
						(b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
					);

					// No tool calls this turn → the model is done answering.
					if (finalMessage.stop_reason !== 'tool_use' || toolUses.length === 0) {
						break;
					}

					// Record the assistant turn (text + tool_use blocks) verbatim.
					convo.push({ role: 'assistant', content: finalMessage.content });

					// Execute each tool and collect tool_result blocks for the next turn.
					const toolResults: Anthropic.ToolResultBlockParam[] = [];
					for (const tu of toolUses) {
						safeEnqueue(sse({ tool: tu.name }));
						const args = (tu.input ?? {}) as Record<string, unknown>;
						const outcome = await runCrmTool(tu.name, args, ctx);
						toolResults.push({
							type: 'tool_result',
							tool_use_id: tu.id,
							content: JSON.stringify(outcome),
							is_error: !outcome.ok,
						});
					}

					convo.push({ role: 'user', content: toolResults });

					// Loop again so the model can read the results and continue.
					// If we hit the iteration cap, the loop ends and we finalize below.
				}

				finish();
			} catch (e) {
				const message = e instanceof Error ? e.message : 'Assistant stream failed';
				safeEnqueue(sse({ error: message }));
				finish();
			}
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no',
		},
	});
};
