/**
 * MCP server for RogueOS — Streamable-HTTP transport (JSON-RPC 2.0 over POST).
 *
 * Lets any MCP client (Guppy, Claude Desktop/Cowork, etc.) operate the CRM:
 * search/create contacts, log calls, tasks, appointments, deals, pipeline summary.
 *
 * Auth: Bearer <ldo_ personal API token> (Settings → API Tokens). Token scopes:
 * 'read' allows read tools; 'write' additionally allows mutating tools.
 * Session JWTs also work (full access) — handy for testing.
 *
 * Protocol notes (matched to Guppy's MCPHttpClient and the 2025-03-26 spec):
 * - POST JSON-RPC; responses are plain application/json (SSE not required).
 * - `initialize` returns serverInfo/capabilities and a Mcp-Session-Id header
 *   (stateless here — the id is accepted back but not required).
 * - Notifications (no `id`) are acknowledged with 202 and an empty body.
 * - GET returns 405 (we don't push server-initiated streams); DELETE is a no-op 200.
 */
import { json, error } from '@sveltejs/kit';
import { randomUUID, } from 'crypto';
import { requireAuth, getEffectiveUserId } from '$lib/server/supabase';
import { rateLimit } from '$lib/server/rateLimit';
import { CRM_TOOLS, toolListForMcp, runCrmTool, type ToolCtx } from '$lib/server/crmTools';
import { BRAND } from '$lib/brand';
import type { RequestHandler } from './$types';

const PROTOCOL_VERSION = '2025-03-26';
const SERVER_INFO = { name: `${BRAND.toLowerCase()}-crm`, version: '1.0.0' };

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

// ── JSON-RPC plumbing ────────────────────────────────────────────────────────

const rpcError = (id: unknown, code: number, message: string, status = 200) =>
	json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, { status });

const rpcResult = (id: unknown, result: unknown, headers: Record<string, string> = {}) =>
	json({ jsonrpc: '2.0', id, result }, { headers });

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	// Auth first (401 before parsing anything)
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const scopes = (user as { token_scopes?: string[] }).token_scopes; // undefined ⇒ session JWT ⇒ full access
	const canWrite = !scopes || scopes.includes('write');

	// Burst damping per identity+IP
	let ip = 'unknown';
	try { ip = getClientAddress(); } catch { /* adapter-dependent */ }
	const rl = rateLimit(`mcp:${ownerId}:${ip}`, 240, 60_000);
	if (!rl.ok) {
		return json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Rate limited' } },
			{ status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds ?? 60) } });
	}

	let body: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
	try {
		body = await request.json();
	} catch {
		return rpcError(null, -32700, 'Parse error', 400);
	}

	const { id, method, params = {} } = body;

	// Notifications (no id) — acknowledge and return
	if (id === undefined || id === null) {
		return new Response(null, { status: 202 });
	}

	try {
		switch (method) {
			case 'initialize':
				return rpcResult(id, {
					protocolVersion: PROTOCOL_VERSION,
					capabilities: { tools: { listChanged: false } },
					serverInfo: SERVER_INFO,
					instructions: `${BRAND} CRM. Use search_contacts to resolve ids before calling contact-linked tools. Write tools require a token with the 'write' scope.`,
				}, { 'Mcp-Session-Id': randomUUID() });

			case 'ping':
				return rpcResult(id, {});

			case 'tools/list':
				return rpcResult(id, { tools: toolListForMcp() });

			case 'tools/call': {
				const name = str((params as Record<string, unknown>).name);
				const args = ((params as Record<string, unknown>).arguments ?? {}) as Record<string, unknown>;
				const tool = CRM_TOOLS[name];
				if (!tool) return rpcError(id, -32602, `Unknown tool: ${name}`);
				if (tool.write && !canWrite) {
					return rpcResult(id, {
						isError: true,
						content: [{ type: 'text', text: `Tool '${name}' requires a token with the 'write' scope. This token is read-only.` }],
					});
				}
				const ctx: ToolCtx = { ownerId, canWrite };
				const outcome = await runCrmTool(name, args, ctx);
				if (!outcome.ok) {
					return rpcResult(id, { isError: true, content: [{ type: 'text', text: outcome.error ?? 'Tool failed' }] });
				}
				return rpcResult(id, {
					content: [{ type: 'text', text: JSON.stringify(outcome.result, null, 2) }],
				});
			}

			case 'resources/list':
				return rpcResult(id, { resources: [] });

			default:
				return rpcError(id, -32601, `Method not found: ${method}`);
		}
	} catch (e) {
		console.error('[mcp] internal error:', e);
		return rpcError(id, -32603, 'Internal error');
	}
};

// Server-initiated streams are not supported (stateless server).
export const GET: RequestHandler = async () => {
	throw error(405, 'Method Not Allowed — POST JSON-RPC to this endpoint');
};

// Session termination — stateless, always fine.
export const DELETE: RequestHandler = async () => new Response(null, { status: 200 });
