import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

function toCSV(rows: Record<string,unknown>[], headers: string[]): string {
	const escape = (v: unknown): string => {
		if (v === null || v === undefined) return '';
		const s = String(v);
		if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
		return s;
	};
	const lines = [headers.join(',')];
	for (const row of rows) {
		lines.push(headers.map(h => escape(row[h])).join(','));
	}
	return lines.join('\n');
}

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const type = url.searchParams.get('type') ?? 'contacts';

	let csv = '';
	let filename = `${type}-export-${new Date().toISOString().slice(0,10)}.csv`;

	if (type === 'contacts') {
		const { data } = await supabaseAdmin
			.from('contacts')
			.select('name, phone, email, company, title, status, contact_type, lead_source, is_business, call_count, last_called_at, contact_score, notes, created_at')
			.eq('user_id', ownerId)
			.order('name');
		const headers = ['name','phone','email','company','title','status','contact_type','lead_source','is_business','call_count','last_called_at','contact_score','notes','created_at'];
		csv = toCSV(data ?? [], headers);
		filename = `contacts-${new Date().toISOString().slice(0,10)}.csv`;
	} else if (type === 'calls') {
		const { data } = await supabaseAdmin
			.from('calls')
			.select('contact:contacts(name,company,phone), outcome, call_type, call_duration_seconds, quality_score, summary, notes, started_at, created_at')
			.eq('user_id', ownerId)
			.order('created_at', { ascending: false });
		const rows = (data ?? []).map(c => ({
			contact_name: (c.contact as {name:string})?.name ?? '',
			company: (c.contact as {company:string})?.company ?? '',
			phone: (c.contact as {phone:string})?.phone ?? '',
			outcome: c.outcome ?? '',
			call_type: c.call_type ?? '',
			duration_seconds: c.call_duration_seconds ?? '',
			quality_score: c.quality_score ?? '',
			summary: c.summary ?? '',
			notes: c.notes ?? '',
			date: c.created_at,
		}));
		csv = toCSV(rows, ['contact_name','company','phone','outcome','call_type','duration_seconds','quality_score','summary','notes','date']);
		filename = `calls-${new Date().toISOString().slice(0,10)}.csv`;
	} else if (type === 'deals') {
		const { data } = await supabaseAdmin
			.from('deals')
			.select('title, value, stage, probability, expected_close, notes, lost_reason, won_at, lost_at, created_at, contact:contacts(name,company), client:clients(name)')
			.eq('user_id', ownerId)
			.order('created_at', { ascending: false });
		const rows = (data ?? []).map(d => ({
			title: d.title,
			value: d.value,
			stage: d.stage,
			probability: d.probability,
			expected_close: d.expected_close ?? '',
			lost_reason: d.lost_reason ?? '',
			contact: (d.contact as {name:string})?.name ?? '',
			company: (d.contact as {company:string})?.company ?? '',
			client: (d.client as {name:string})?.name ?? '',
			notes: d.notes ?? '',
			won_at: d.won_at ?? '',
			created_at: d.created_at,
		}));
		csv = toCSV(rows, ['title','value','stage','probability','expected_close','contact','company','client','lost_reason','notes','won_at','created_at']);
		filename = `deals-${new Date().toISOString().slice(0,10)}.csv`;
	} else if (type === 'time-entries') {
		const { data } = await supabaseAdmin
			.from('time_entries')
			.select('entry_date, duration_minutes, description, billable, hourly_rate, client:clients(name), project:projects(name), campaign:campaigns(name)')
			.eq('user_id', ownerId)
			.order('entry_date', { ascending: false });
		const rows = (data ?? []).map(t => ({
			date: t.entry_date,
			hours: ((t.duration_minutes ?? 0) / 60).toFixed(2),
			minutes: t.duration_minutes ?? 0,
			description: t.description ?? '',
			billable: t.billable ? 'yes' : 'no',
			hourly_rate: t.hourly_rate ?? '',
			earnings: t.billable && t.hourly_rate ? ((t.duration_minutes / 60) * t.hourly_rate).toFixed(2) : '',
			client: (t.client as {name:string})?.name ?? '',
			project: (t.project as {name:string})?.name ?? '',
			campaign: (t.campaign as {name:string})?.name ?? '',
		}));
		csv = toCSV(rows, ['date','hours','minutes','description','billable','hourly_rate','earnings','client','project','campaign']);
		filename = `time-entries-${new Date().toISOString().slice(0,10)}.csv`;
	} else if (type === 'analytics') {
		const { data } = await supabaseAdmin
			.from('api_usage_log')
			.select('created_at, twilio_duration_minutes, twilio_cost, groq_cost, claude_cost, total_cost, call:calls(outcome, contact:contacts(name,company))')
			.eq('user_id', ownerId)
			.order('created_at', { ascending: false });
		const rows = (data ?? []).map(r => ({
			date: r.created_at,
			contact: (r.call as {contact:{name:string}})?.contact?.name ?? '',
			company: (r.call as {contact:{company:string}})?.contact?.company ?? '',
			outcome: (r.call as {outcome:string})?.outcome ?? '',
			twilio_minutes: r.twilio_duration_minutes ?? 0,
			twilio_cost: r.twilio_cost ?? 0,
			groq_cost: r.groq_cost ?? 0,
			claude_cost: r.claude_cost ?? 0,
			total_cost: r.total_cost ?? 0,
		}));
		csv = toCSV(rows, ['date','contact','company','outcome','twilio_minutes','twilio_cost','groq_cost','claude_cost','total_cost']);
		filename = `analytics-${new Date().toISOString().slice(0,10)}.csv`;
	}

	if (type === 'companies') {
		const { data } = await supabaseAdmin
			.from('companies')
			.select('name, phone, email, website, industry, city, state, company_type, size, tags, created_at, client:clients(name)')
			.eq('user_id', ownerId)
			.is('deleted_at', null)
			.order('name');
		const rows = (data ?? []).map((c: any) => [
			c.name, c.company_type, c.phone ?? '', c.email ?? '', c.website ?? '',
			c.industry ?? '', c.city ?? '', c.state ?? '',
			c.size ?? '', (c.tags ?? []).join(';'), c.client?.name ?? '',
			new Date(c.created_at).toLocaleDateString(),
		]);
		const csvOut = [
			['Name','Type','Phone','Email','Website','Industry','City','State','Size','Tags','Client','Created'],
			...rows
		].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
		return new Response(csvOut, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="companies.csv"' } });
	}

	if (type === 'tasks') {
		const { data } = await supabaseAdmin
			.from('tasks')
			.select('title, status, priority, task_type, due_date, description, created_at, contact:contacts(name, company)')
			.eq('user_id', ownerId)
			.is('deleted_at', null)
			.order('due_date', { ascending: true, nullsFirst: false });
		const rows = (data ?? []).map((t: any) => [
			t.title, t.status, t.priority, t.task_type,
			t.due_date ? new Date(t.due_date).toLocaleDateString() : '',
			t.contact?.name ?? '', t.contact?.company ?? '',
			t.description ?? '',
			new Date(t.created_at).toLocaleDateString(),
		]);
		const csvOut = [
			['Title','Status','Priority','Type','Due Date','Contact','Company','Notes','Created'],
			...rows
		].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
		return new Response(csvOut, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="tasks.csv"' } });
	}

	if (type === 'campaigns') {
		const { data } = await supabaseAdmin
			.from('campaigns')
			.select('name, status, campaign_type, goal, win_label, win_count, target_wins, daily_call_goal, calls_today, total_calls, created_at, project:projects(name, client:clients(name))')
			.eq('user_id', ownerId)
			.is('deleted_at', null)
			.order('created_at', { ascending: false });
		const rows = (data ?? []).map((c: any) => [
			c.name, c.status, c.campaign_type ?? 'call',
			(c.project as any)?.client?.name ?? '',
			(c.project as any)?.name ?? '',
			c.goal ?? '', c.win_label ?? '', c.win_count ?? 0, c.target_wins ?? '',
			c.daily_call_goal ?? '', c.calls_today ?? 0, c.total_calls ?? 0,
			new Date(c.created_at).toLocaleDateString(),
		]);
		const csvOut = [
			['Name','Status','Type','Client','Project','Goal','Win Label','Wins','Target Wins','Daily Goal','Calls Today','Total Calls','Created'],
			...rows
		].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
		return new Response(csvOut, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="campaigns.csv"' } });
	}

	if (type === 'invoices') {
		const { data } = await supabaseAdmin
			.from('invoices')
			.select('invoice_number, status, contract_type, description, total_amount, amount, invoice_date, due_date, scope_of_work, created_at, client:clients(name, primary_contact_email)')
			.eq('user_id', ownerId)
			.order('created_at', { ascending: false });
		const rows = (data ?? []).map((inv: any) => [
			inv.invoice_number ?? '',
			(inv.client as any)?.name ?? '',
			(inv.client as any)?.primary_contact_email ?? '',
			inv.status, inv.contract_type ?? 'invoice',
			inv.description ?? '',
			Number(inv.total_amount ?? inv.amount ?? 0).toFixed(2),
			inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString() : '',
			inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '',
			inv.scope_of_work ?? '',
			new Date(inv.created_at).toLocaleDateString(),
		]);
		const csvOut = [
			['Invoice #','Client','Client Email','Status','Type','Description','Amount','Invoice Date','Due Date','Scope','Created'],
			...rows
		].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
		return new Response(csvOut, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="invoices.csv"' } });
	}

	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${filename}"`,
		},
	});
};
