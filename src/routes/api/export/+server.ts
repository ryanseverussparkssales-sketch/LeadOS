import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Stream the export in pages so a 100k-row table never materializes in memory
// (the previous version loaded the whole table + built one giant string → OOM).
const CHUNK = 1000;

function csvCell(v: unknown): string {
	if (v === null || v === undefined) return '';
	const s = String(v);
	return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function dateOnly(v: unknown): string {
	if (!v) return '';
	const d = new Date(v as string);
	return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString();
}

type ExportConfig = {
	table: string;
	select: string;
	order: { column: string; ascending?: boolean; nullsFirst?: boolean };
	filterDeleted?: boolean;
	headers: string[];
	mapRow: (row: Record<string, any>) => unknown[];
};

const CONFIGS: Record<string, ExportConfig> = {
	contacts: {
		table: 'contacts',
		select: 'name, phone, email, company, title, status, contact_type, lead_source, is_business, call_count, last_called_at, contact_score, notes, created_at',
		order: { column: 'name' },
		headers: ['name','phone','email','company','title','status','contact_type','lead_source','is_business','call_count','last_called_at','contact_score','notes','created_at'],
		mapRow: (r) => [r.name, r.phone, r.email, r.company, r.title, r.status, r.contact_type, r.lead_source, r.is_business, r.call_count, r.last_called_at, r.contact_score, r.notes, r.created_at],
	},
	calls: {
		table: 'calls',
		select: 'contact:contacts(name,company,phone), outcome, call_type, call_duration_seconds, quality_score, summary, notes, started_at, created_at',
		order: { column: 'created_at', ascending: false },
		headers: ['contact_name','company','phone','outcome','call_type','duration_seconds','quality_score','summary','notes','date'],
		mapRow: (r) => [r.contact?.name ?? '', r.contact?.company ?? '', r.contact?.phone ?? '', r.outcome ?? '', r.call_type ?? '', r.call_duration_seconds ?? '', r.quality_score ?? '', r.summary ?? '', r.notes ?? '', r.created_at],
	},
	deals: {
		table: 'deals',
		select: 'title, value, stage, probability, expected_close, notes, lost_reason, won_at, lost_at, created_at, contact:contacts(name,company), client:clients(name)',
		order: { column: 'created_at', ascending: false },
		headers: ['title','value','stage','probability','expected_close','contact','company','client','lost_reason','notes','won_at','created_at'],
		mapRow: (r) => [r.title, r.value, r.stage, r.probability, r.expected_close ?? '', r.contact?.name ?? '', r.contact?.company ?? '', r.client?.name ?? '', r.lost_reason ?? '', r.notes ?? '', r.won_at ?? '', r.created_at],
	},
	'time-entries': {
		table: 'time_entries',
		select: 'entry_date, duration_minutes, description, billable, hourly_rate, client:clients(name), project:projects(name), campaign:campaigns(name)',
		order: { column: 'entry_date', ascending: false },
		headers: ['date','hours','minutes','description','billable','hourly_rate','earnings','client','project','campaign'],
		mapRow: (r) => [r.entry_date, ((r.duration_minutes ?? 0) / 60).toFixed(2), r.duration_minutes ?? 0, r.description ?? '', r.billable ? 'yes' : 'no', r.hourly_rate ?? '', r.billable && r.hourly_rate ? ((r.duration_minutes / 60) * r.hourly_rate).toFixed(2) : '', r.client?.name ?? '', r.project?.name ?? '', r.campaign?.name ?? ''],
	},
	analytics: {
		table: 'api_usage_log',
		select: 'created_at, twilio_duration_minutes, twilio_cost, groq_cost, claude_cost, total_cost, call:calls(outcome, contact:contacts(name,company))',
		order: { column: 'created_at', ascending: false },
		headers: ['date','contact','company','outcome','twilio_minutes','twilio_cost','groq_cost','claude_cost','total_cost'],
		mapRow: (r) => [r.created_at, r.call?.contact?.name ?? '', r.call?.contact?.company ?? '', r.call?.outcome ?? '', r.twilio_duration_minutes ?? 0, r.twilio_cost ?? 0, r.groq_cost ?? 0, r.claude_cost ?? 0, r.total_cost ?? 0],
	},
	companies: {
		table: 'companies',
		select: 'name, phone, email, website, industry, city, state, company_type, size, tags, created_at, client:clients(name)',
		order: { column: 'name' },
		filterDeleted: true,
		headers: ['Name','Type','Phone','Email','Website','Industry','City','State','Size','Tags','Client','Created'],
		mapRow: (r) => [r.name, r.company_type, r.phone ?? '', r.email ?? '', r.website ?? '', r.industry ?? '', r.city ?? '', r.state ?? '', r.size ?? '', (r.tags ?? []).join(';'), r.client?.name ?? '', dateOnly(r.created_at)],
	},
	tasks: {
		table: 'tasks',
		select: 'title, status, priority, task_type, due_date, description, created_at, contact:contacts(name, company)',
		order: { column: 'due_date', ascending: true, nullsFirst: false },
		filterDeleted: true,
		headers: ['Title','Status','Priority','Type','Due Date','Contact','Company','Notes','Created'],
		mapRow: (r) => [r.title, r.status, r.priority, r.task_type, dateOnly(r.due_date), r.contact?.name ?? '', r.contact?.company ?? '', r.description ?? '', dateOnly(r.created_at)],
	},
	campaigns: {
		table: 'campaigns',
		select: 'name, status, campaign_type, goal, win_label, win_count, target_wins, daily_call_goal, calls_today, total_calls, created_at, project:projects(name, client:clients(name))',
		order: { column: 'created_at', ascending: false },
		filterDeleted: true,
		headers: ['Name','Status','Type','Client','Project','Goal','Win Label','Wins','Target Wins','Daily Goal','Calls Today','Total Calls','Created'],
		mapRow: (r) => [r.name, r.status, r.campaign_type ?? 'call', r.project?.client?.name ?? '', r.project?.name ?? '', r.goal ?? '', r.win_label ?? '', r.win_count ?? 0, r.target_wins ?? '', r.daily_call_goal ?? '', r.calls_today ?? 0, r.total_calls ?? 0, dateOnly(r.created_at)],
	},
	invoices: {
		table: 'invoices',
		select: 'invoice_number, status, contract_type, description, total_amount, amount, invoice_date, due_date, scope_of_work, created_at, client:clients(name, primary_contact_email)',
		order: { column: 'created_at', ascending: false },
		headers: ['Invoice #','Client','Client Email','Status','Type','Description','Amount','Invoice Date','Due Date','Scope','Created'],
		mapRow: (r) => [r.invoice_number ?? '', r.client?.name ?? '', r.client?.primary_contact_email ?? '', r.status, r.contract_type ?? 'invoice', r.description ?? '', Number(r.total_amount ?? r.amount ?? 0).toFixed(2), dateOnly(r.invoice_date), dateOnly(r.due_date), r.scope_of_work ?? '', dateOnly(r.created_at)],
	},
};

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const type = url.searchParams.get('type') ?? 'contacts';
	const cfg = CONFIGS[type];
	if (!cfg) throw error(400, `Unknown export type: ${type}`);

	const filename = `${type}-${new Date().toISOString().slice(0, 10)}.csv`;
	const enc = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			controller.enqueue(enc.encode(cfg.headers.map(csvCell).join(',') + '\n'));
			let offset = 0;
			try {
				for (;;) {
					let q = supabaseAdmin.from(cfg.table).select(cfg.select).eq('user_id', ownerId);
					if (cfg.filterDeleted) q = q.is('deleted_at', null);
					q = q.order(cfg.order.column, { ascending: cfg.order.ascending ?? true, nullsFirst: cfg.order.nullsFirst });
					const { data, error: e } = await q.range(offset, offset + CHUNK - 1);
					if (e) { console.error('[export]', type, e.message); break; }
					const rows = (data ?? []) as Record<string, any>[];
					for (const row of rows) controller.enqueue(enc.encode(cfg.mapRow(row).map(csvCell).join(',') + '\n'));
					if (rows.length < CHUNK) break;
					offset += CHUNK;
				}
			} catch (err) {
				console.error('[export] stream error:', err);
			}
			controller.close();
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${filename}"`,
		},
	});
};
