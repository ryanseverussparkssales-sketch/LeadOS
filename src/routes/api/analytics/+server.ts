import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import { PRICING } from '$lib/server/analytics';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const period     = url.searchParams.get('period') ?? 'today';
	const clientId   = url.searchParams.get('client_id');
	const projectId  = url.searchParams.get('project_id');
	const campaignId = url.searchParams.get('campaign_id');

	const now = new Date();
	let since: Date;
	if (period === 'week')       { since = new Date(now); since.setDate(now.getDate() - 7); }
	else if (period === 'month') { since = new Date(now); since.setDate(1); since.setHours(0,0,0,0); }
	else if (period === 'all')   { since = new Date('2020-01-01'); }
	else                         { since = new Date(now); since.setHours(0,0,0,0); }

	// Build call query — join through campaign/call_list for project/client filtering
	// Use !inner on contacts join so calls whose contact is soft-deleted are excluded
	let callQuery = supabaseAdmin
		.from('calls')
		.select(`id, outcome, call_duration_seconds, summary, notes, created_at, 
			contact:contacts!inner(name, company),
			call_list:call_lists(campaign:campaigns(id, name, project:projects(id, name, client:clients(id, name))))`)
		.eq('user_id', ownerId)
		.is('contacts.deleted_at', null)
		.gte('created_at', since.toISOString())
		.order('created_at', { ascending: false })
		.limit(200);

	const { data: allCalls } = await callQuery;
	let callList = allCalls ?? [];

	// Filter by client/project/campaign via the joined hierarchy
	if (campaignId) {
		callList = callList.filter(c => {
			const camp = (c.call_list as {campaign?: {id:string}})?.campaign;
			return camp?.id === campaignId;
		});
	} else if (projectId) {
		callList = callList.filter(c => {
			const proj = (c.call_list as {campaign?: {project?: {id:string}}})?.campaign?.project;
			return proj?.id === projectId;
		});
	} else if (clientId) {
		callList = callList.filter(c => {
			const client = (c.call_list as {campaign?: {project?: {client?: {id:string}}}})?.campaign?.project?.client;
			return client?.id === clientId;
		});
	}

	// Cost data (also filterable)
	const callIds = callList.map(c => c.id);
	let usage: Record<string, number>[] = [];
	if (callIds.length) {
		const { data } = await supabaseAdmin
			.from('api_usage_log')
			.select('*')
			.in('call_id', callIds);
		usage = data ?? [];
	}

	// Time entries for this filter
	let timeQuery = supabaseAdmin
		.from('time_entries')
		.select('duration_minutes, billable, hourly_rate, entry_date')
		.eq('user_id', ownerId)
		.gte('entry_date', since.toISOString().slice(0,10));
	if (clientId)   timeQuery = timeQuery.eq('client_id', clientId);
	if (projectId)  timeQuery = timeQuery.eq('project_id', projectId);
	if (campaignId) timeQuery = timeQuery.eq('campaign_id', campaignId);
	const { data: timeData } = await timeQuery;
	const timeEntries = timeData ?? [];

	// Aggregate
	const totals = usage.reduce((acc, row) => ({
		twilio: acc.twilio + (row.twilio_cost ?? 0),
		groq:   acc.groq   + (row.groq_cost ?? 0),
		claude: acc.claude + (row.claude_cost ?? 0),
		total:  acc.total  + (row.total_cost ?? 0),
		minutes: acc.minutes + (row.twilio_duration_minutes ?? 0),
	}), { twilio: 0, groq: 0, claude: 0, total: 0, minutes: 0 });

	const outcomes: Record<string, number> = {};
	for (const c of callList) {
		const o = c.outcome ?? 'unlogged';
		outcomes[o] = (outcomes[o] ?? 0) + 1;
	}

	const timeTotal = timeEntries.reduce((s, t) => s + t.duration_minutes, 0);
	const timeBillable = timeEntries.filter(t => t.billable).reduce((s, t) => s + t.duration_minutes, 0);

	// Daily breakdown
	const dailyMap: Record<string, { calls: number; cost: number; timeMins: number }> = {};
	for (const row of usage) {
		const day = new Date(row.created_at).toLocaleDateString();
		if (!dailyMap[day]) dailyMap[day] = { calls: 0, cost: 0, timeMins: 0 };
		dailyMap[day].cost += row.total_cost ?? 0;
	}
	for (const c of callList) {
		const day = new Date(c.created_at).toLocaleDateString();
		if (!dailyMap[day]) dailyMap[day] = { calls: 0, cost: 0, timeMins: 0 };
		dailyMap[day].calls += 1;
	}
	for (const t of timeEntries) {
		const day = new Date(t.entry_date).toLocaleDateString();
		if (!dailyMap[day]) dailyMap[day] = { calls: 0, cost: 0, timeMins: 0 };
		dailyMap[day].timeMins += t.duration_minutes;
	}

	return json({
		period, filters: { clientId, projectId, campaignId },
		totals,
		callCount: callList.length,
		avgCostPerCall: callList.length ? totals.total / callList.length : 0,
		avgDurationMinutes: callList.length ? totals.minutes / callList.length : 0,
		outcomes,
		time: { totalMins: timeTotal, billableMins: timeBillable, entries: timeEntries.length },
		daily: Object.entries(dailyMap).map(([date, d]) => ({ date, ...d })),
		recentUsage: usage.slice(0, 10),
		pricing: PRICING,
	});
};
