/**
 * Shared CRM tool registry for RogueOS.
 *
 * Single source of truth for the CRM tool definitions used by:
 *  - the MCP server (`src/routes/api/mcp/+server.ts`) — Streamable-HTTP JSON-RPC
 *  - the cloud assistant route (Anthropic tool-use)
 *
 * Every tool is tenancy-scoped via `ctx.ownerId`. Write-gating is enforced by
 * each consumer (the MCP route checks `CRM_TOOLS[name].write` against the token
 * scope before calling `runCrmTool`; the cloud route enforces its own policy).
 */
import { supabaseAdmin, normalizePhone } from '$lib/server/supabase';
import { initialContactScore } from '$lib/server/scoring';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToolCtx = { ownerId: string; canWrite: boolean };
export type ToolDef = {
	description: string;
	inputSchema: Record<string, unknown>;
	write: boolean;
	run: (args: Record<string, unknown>, ctx: ToolCtx) => Promise<unknown>;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown, dflt: number): number => {
	const n = Number(v);
	return Number.isFinite(n) ? n : dflt;
};
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

async function assertOwnedContact(contactId: string, ownerId: string) {
	if (!UUID_RE.test(contactId)) throw new Error('invalid contact_id');
	const { data } = await supabaseAdmin
		.from('contacts').select('id, name, company')
		.eq('id', contactId).eq('user_id', ownerId).is('deleted_at', null).maybeSingle();
	if (!data) throw new Error('Contact not found');
	return data;
}

// ── Tool registry ──────────────────────────────────────────────────────────────

export const CRM_TOOLS: Record<string, ToolDef> = {
	search_contacts: {
		description: 'Search CRM contacts by name, company, email, or phone. Returns up to `limit` matches with ids for use in other tools.',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Name, company, email, or phone fragment' },
				limit: { type: 'number', description: 'Max results (default 10, max 25)' },
			},
			required: ['query'],
		},
		write: false,
		run: async (args, { ownerId }) => {
			const q = str(args.query);
			if (!q) throw new Error('query required');
			const limit = Math.min(Math.max(1, num(args.limit, 10)), 25);
			const esc = q.replace(/[%_,]/g, ' ').trim();
			const { data } = await supabaseAdmin
				.from('contacts')
				.select('id, name, company, title, phone, email, status, contact_type')
				.eq('user_id', ownerId).is('deleted_at', null)
				.or(`name.ilike.%${esc}%,company.ilike.%${esc}%,email.ilike.%${esc}%,phone.ilike.%${esc}%`)
				.limit(limit);
			return { count: (data ?? []).length, contacts: data ?? [] };
		},
	},

	create_contact: {
		description: 'Create a CRM contact (dedupes by phone/email — returns the existing contact if already present).',
		inputSchema: {
			type: 'object',
			properties: {
				name: { type: 'string' },
				phone: { type: 'string' },
				email: { type: 'string' },
				company: { type: 'string' },
				title: { type: 'string' },
				notes: { type: 'string' },
			},
			required: ['name'],
		},
		write: true,
		run: async (args, { ownerId }) => {
			const name = str(args.name);
			if (!name) throw new Error('name required');
			const phone = str(args.phone);
			const email = str(args.email).toLowerCase();
			const phoneNorm = phone ? normalizePhone(phone) : null;
			// Dedup (same semantics as the inbound lead webhook)
			if (phoneNorm) {
				const { data } = await supabaseAdmin.from('contacts').select('id, name, company')
					.eq('user_id', ownerId).eq('phone_normalized', phoneNorm).maybeSingle();
				if (data) return { created: false, existing: true, contact: data };
			}
			if (email) {
				const { data } = await supabaseAdmin.from('contacts').select('id, name, company')
					.eq('user_id', ownerId).eq('email_normalized', email).maybeSingle();
				if (data) return { created: false, existing: true, contact: data };
			}
			const { data: created, error: e } = await supabaseAdmin.from('contacts').insert({
				user_id: ownerId,
				name,
				phone: phone || null,
				phone_normalized: phoneNorm,
				email: email || null,
				email_normalized: email || null,
				company: str(args.company) || null,
				title: str(args.title) || null,
				notes: str(args.notes) || null,
				lead_score: initialContactScore({ phone, email, company: str(args.company) }),
				status: 'new',
				lead_metadata: { lead_source: 'mcp' },
			}).select('id, name, company, phone, email').single();
			if (e) throw new Error(e.message);
			return { created: true, contact: created };
		},
	},

	log_call: {
		description: 'Log a completed call against a contact with an outcome. Valid outcomes: answered, no_answer, busy, left_voicemail, callback, appointment_set, demo_scheduled, meeting_confirmed, signed_up, not_interested, do_not_call, follow_up_agreed, wrong_number.',
		inputSchema: {
			type: 'object',
			properties: {
				contact_id: { type: 'string' },
				outcome: { type: 'string' },
				notes: { type: 'string' },
				duration_seconds: { type: 'number' },
			},
			required: ['contact_id', 'outcome'],
		},
		write: true,
		run: async (args, { ownerId }) => {
			const OUTCOMES = new Set(['answered','no_answer','busy','left_voicemail','callback','appointment_set','demo_scheduled','meeting_confirmed','signed_up','not_interested','do_not_call','follow_up_agreed','wrong_number','info_requested','referral']);
			const outcome = str(args.outcome);
			if (!OUTCOMES.has(outcome)) throw new Error(`invalid outcome; one of: ${[...OUTCOMES].join(', ')}`);
			const contact = await assertOwnedContact(str(args.contact_id), ownerId);
			const { data, error: e } = await supabaseAdmin.from('calls').insert({
				user_id: ownerId,
				contact_id: contact.id,
				outcome,
				notes: str(args.notes) || null,
				call_duration_seconds: Math.max(0, num(args.duration_seconds, 0)),
				ended_at: new Date().toISOString(),
			}).select('id, outcome').single();
			if (e) throw new Error(e.message);
			if (outcome === 'do_not_call') {
				await supabaseAdmin.from('contacts').update({ status: 'do_not_call' })
					.eq('id', contact.id).eq('user_id', ownerId);
			}
			return { logged: true, call_id: data.id, contact: contact.name };
		},
	},

	create_task: {
		description: 'Create a task/reminder, optionally linked to a contact and due in N hours.',
		inputSchema: {
			type: 'object',
			properties: {
				title: { type: 'string' },
				notes: { type: 'string' },
				contact_id: { type: 'string' },
				due_in_hours: { type: 'number', description: 'Hours from now (default 24)' },
				priority: { type: 'string', description: 'low | medium | high' },
			},
			required: ['title'],
		},
		write: true,
		run: async (args, { ownerId }) => {
			const title = str(args.title);
			if (!title) throw new Error('title required');
			let contactId: string | null = null;
			if (str(args.contact_id)) contactId = (await assertOwnedContact(str(args.contact_id), ownerId)).id;
			const priority = ['low', 'medium', 'high'].includes(str(args.priority)) ? str(args.priority) : 'medium';
			const dueMs = Math.max(0.1, num(args.due_in_hours, 24)) * 3600_000;
			const { data, error: e } = await supabaseAdmin.from('tasks').insert({
				user_id: ownerId,
				contact_id: contactId,
				title,
				notes: str(args.notes) || null,
				priority,
				status: 'pending',
				due_date: new Date(Date.now() + dueMs).toISOString(),
			}).select('id, title, due_date').single();
			if (e) throw new Error(e.message);
			return { created: true, task: data };
		},
	},

	create_note: {
		description: 'Save a quick note to the CRM (a "drop a note" capture). Stored as a note task the user can find later; optionally linked to a contact.',
		inputSchema: {
			type: 'object',
			properties: {
				text: { type: 'string', description: 'The full note text' },
				contact_id: { type: 'string', description: 'Optional contact to attach the note to' },
			},
			required: ['text'],
		},
		write: true,
		run: async (args, { ownerId }) => {
			const text = str(args.text);
			if (!text) throw new Error('text required');
			let contactId: string | null = null;
			if (str(args.contact_id)) contactId = (await assertOwnedContact(str(args.contact_id), ownerId)).id;
			const title = text.length > 80 ? `${text.slice(0, 80).trimEnd()}…` : text;
			const { data, error: e } = await supabaseAdmin.from('tasks').insert({
				user_id: ownerId,
				contact_id: contactId,
				task_type: 'note',
				title,
				description: text,
				priority: 'low',
				status: 'pending',
			}).select('id').single();
			if (e) throw new Error(e.message);
			return { created: true, id: data.id };
		},
	},

	pipeline_summary: {
		description: 'Weighted pipeline forecast: expected/best-case value for open deals overall, closing this month, and this quarter, plus won actuals.',
		inputSchema: { type: 'object', properties: {} },
		write: false,
		run: async (_args, { ownerId }) => {
			const now = new Date();
			const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
			const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
			const qs = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
			const [{ data: open }, { data: won }] = await Promise.all([
				supabaseAdmin.from('deals').select('value, probability, expected_close, stage')
					.eq('user_id', ownerId).is('deleted_at', null).not('stage', 'in', '(won,lost)').limit(5000),
				supabaseAdmin.from('deals').select('value, won_at')
					.eq('user_id', ownerId).is('deleted_at', null).eq('stage', 'won')
					.gte('won_at', qs.toISOString()).limit(5000),
			]);
			let pw = 0, pb = 0, mw = 0, mb = 0, qw = 0, qb = 0;
			for (const d of open ?? []) {
				const v = Number(d.value ?? 0), p = Number(d.probability ?? 0) / 100;
				pw += v * p; pb += v;
				if (d.expected_close) {
					const c = new Date(d.expected_close);
					if (c >= monthStart && c < monthEnd) { mw += v * p; mb += v; }
					if (c >= qs) { qw += v * p; qb += v; }
				}
			}
			const wonTotal = (won ?? []).reduce((s, d) => s + Number(d.value ?? 0), 0);
			const wonMonth = (won ?? []).filter(d => d.won_at && new Date(d.won_at) >= monthStart)
				.reduce((s, d) => s + Number(d.value ?? 0), 0);
			const r = Math.round;
			return {
				openDeals: (open ?? []).length,
				pipeline: { weighted: r(pw), bestCase: r(pb) },
				thisMonth: { weighted: r(mw), bestCase: r(mb) },
				thisQuarter: { weighted: r(qw), bestCase: r(qb) },
				won: { thisMonth: r(wonMonth), thisQuarter: r(wonTotal), count: (won ?? []).length },
			};
		},
	},

	todays_agenda: {
		description: "Today's agenda: pending tasks due today/overdue and today's appointments.",
		inputSchema: { type: 'object', properties: {} },
		write: false,
		run: async (_args, { ownerId }) => {
			const dayEnd = new Date(); dayEnd.setHours(23, 59, 59, 999);
			const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
			const [{ data: tasks }, { data: appts }] = await Promise.all([
				supabaseAdmin.from('tasks')
					.select('id, title, priority, due_date, contact:contacts(name, company)')
					.eq('user_id', ownerId).eq('status', 'pending')
					.lte('due_date', dayEnd.toISOString())
					.order('due_date', { ascending: true }).limit(25),
				supabaseAdmin.from('appointments')
					.select('id, scheduled_at, duration_minutes, status, notes, contact:contacts(name, company, phone)')
					.eq('owner_user_id', ownerId)
					.gte('scheduled_at', dayStart.toISOString()).lte('scheduled_at', dayEnd.toISOString())
					.neq('status', 'cancelled')
					.order('scheduled_at', { ascending: true }).limit(25),
			]);
			return { tasksDue: tasks ?? [], appointmentsToday: appts ?? [] };
		},
	},

	list_appointments: {
		description: 'Upcoming appointments over the next N days (default 7).',
		inputSchema: {
			type: 'object',
			properties: { days: { type: 'number', description: '1–30, default 7' } },
		},
		write: false,
		run: async (args, { ownerId }) => {
			const days = Math.min(Math.max(1, num(args.days, 7)), 30);
			const { data } = await supabaseAdmin.from('appointments')
				.select('id, scheduled_at, duration_minutes, status, notes, contact:contacts(name, company, phone)')
				.eq('owner_user_id', ownerId)
				.gte('scheduled_at', new Date().toISOString())
				.lte('scheduled_at', new Date(Date.now() + days * 86400_000).toISOString())
				.neq('status', 'cancelled')
				.order('scheduled_at', { ascending: true }).limit(50);
			return { appointments: data ?? [] };
		},
	},

	create_appointment: {
		description: 'Book an appointment with a contact at an ISO datetime (e.g. 2026-07-08T15:00:00Z).',
		inputSchema: {
			type: 'object',
			properties: {
				contact_id: { type: 'string' },
				scheduled_at: { type: 'string', description: 'ISO 8601 datetime' },
				duration_minutes: { type: 'number', description: 'default 30' },
				notes: { type: 'string' },
			},
			required: ['contact_id', 'scheduled_at'],
		},
		write: true,
		run: async (args, { ownerId }) => {
			const contact = await assertOwnedContact(str(args.contact_id), ownerId);
			const when = new Date(str(args.scheduled_at));
			if (Number.isNaN(when.getTime())) throw new Error('scheduled_at must be an ISO datetime');
			const { data, error: e } = await supabaseAdmin.from('appointments').insert({
				owner_user_id: ownerId,
				contact_id: contact.id,
				scheduled_at: when.toISOString(),
				duration_minutes: Math.min(Math.max(5, num(args.duration_minutes, 30)), 480),
				status: 'scheduled',
				notes: str(args.notes) || null,
				qualifying_answers: { source: 'mcp' },
			}).select('id, scheduled_at').single();
			if (e) throw new Error(e.message);
			return { booked: true, appointment: data, contact: contact.name };
		},
	},

	add_deal: {
		description: 'Create a deal in the pipeline (stage defaults to prospect).',
		inputSchema: {
			type: 'object',
			properties: {
				title: { type: 'string' },
				value: { type: 'number' },
				contact_id: { type: 'string' },
				stage: { type: 'string', description: 'prospect | qualified | demo | proposal | negotiation' },
				notes: { type: 'string' },
			},
			required: ['title'],
		},
		write: true,
		run: async (args, { ownerId }) => {
			const title = str(args.title);
			if (!title) throw new Error('title required');
			const STAGES: Record<string, number> = { prospect: 20, qualified: 25, demo: 40, proposal: 60, negotiation: 80 };
			const stage = STAGES[str(args.stage)] !== undefined ? str(args.stage) : 'prospect';
			let contactId: string | null = null;
			if (str(args.contact_id)) contactId = (await assertOwnedContact(str(args.contact_id), ownerId)).id;
			const { data, error: e } = await supabaseAdmin.from('deals').insert({
				user_id: ownerId,
				title,
				value: Math.max(0, num(args.value, 0)),
				contact_id: contactId,
				stage,
				probability: STAGES[stage],
				notes: str(args.notes) || null,
			}).select('id, title, stage, value').single();
			if (e) throw new Error(e.message);
			return { created: true, deal: data };
		},
	},

	get_recent_call: {
		description: 'Get the most recent logged call for the owner, optionally for a specific contact. Returns outcome, AI summary, transcript excerpt, duration, provider, and the contact. Use this to answer questions like "summarize my last call with Acme" or "what were the next steps from my last call".',
		inputSchema: {
			type: 'object',
			properties: {
				contact_id: { type: 'string', description: 'Optional — limit to the most recent call with this contact' },
			},
		},
		write: false,
		run: async (args, { ownerId }) => {
			let contactId: string | null = null;
			if (str(args.contact_id)) {
				const contact = await assertOwnedContact(str(args.contact_id), ownerId);
				contactId = contact.id;
			}
			let q = supabaseAdmin
				.from('calls')
				.select('id, outcome, summary, raw_transcript, call_duration_seconds, provider, created_at, contact:contacts(name, company)')
				.eq('user_id', ownerId)
				.order('created_at', { ascending: false })
				.limit(1);
			if (contactId) q = q.eq('contact_id', contactId);
			const { data, error: e } = await q.maybeSingle();
			if (e) throw new Error(e.message);
			if (!data) return { found: false };
			const transcript = typeof data.raw_transcript === 'string'
				? (data.raw_transcript.length > 4000 ? `${data.raw_transcript.slice(0, 4000)}…` : data.raw_transcript)
				: null;
			return {
				found: true,
				call: {
					id: data.id,
					outcome: data.outcome ?? null,
					summary: data.summary ?? null,
					raw_transcript: transcript,
					duration: data.call_duration_seconds ?? null,
					provider: data.provider ?? null,
					created_at: data.created_at,
					contact: data.contact ?? null,
				},
			};
		},
	},
};

// ── Consumer-facing projections ─────────────────────────────────────────────────

/** The tool list the MCP `tools/list` method returns (adds the write-scope hint). */
export function toolListForMcp(): { name: string; description: string; inputSchema: Record<string, unknown> }[] {
	return Object.entries(CRM_TOOLS).map(([name, t]) => ({
		name,
		description: t.description + (t.write ? " (requires 'write' scope)" : ''),
		inputSchema: t.inputSchema,
	}));
}

/**
 * The same tools mapped to Anthropic tool-use format (`input_schema`, not
 * `inputSchema`). ALL tools are included — the cloud route enforces write-scope
 * itself, so descriptions are left unchanged here.
 */
export function anthropicToolSpecs(): { name: string; description: string; input_schema: Record<string, unknown> }[] {
	return Object.entries(CRM_TOOLS).map(([name, t]) => ({
		name,
		description: t.description,
		input_schema: t.inputSchema,
	}));
}

/**
 * Single execution path both consumers call. Looks up the tool, runs it,
 * and normalizes success/failure into a plain result envelope.
 * Unknown tool → `{ ok: false, error }`.
 */
export async function runCrmTool(
	name: string,
	args: Record<string, unknown>,
	ctx: ToolCtx,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
	const tool = CRM_TOOLS[name];
	if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
	try {
		const result = await tool.run(args, ctx);
		return { ok: true, result };
	} catch (e) {
		const error = e instanceof Error ? e.message : 'Tool failed';
		return { ok: false, error };
	}
}
