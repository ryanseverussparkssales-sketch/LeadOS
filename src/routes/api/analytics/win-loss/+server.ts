import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const period = url.searchParams.get('period') ?? 'month';

	const since = new Date();
	if (period === 'quarter') since.setMonth(since.getMonth() - 3);
	else if (period === 'year') since.setFullYear(since.getFullYear() - 1);
	else { since.setDate(1); since.setHours(0,0,0,0); }

	const { data: deals } = await supabaseAdmin
		.from('deals')
		.select('id, stage, value, lost_reason, won_at, lost_at, created_at, probability')
		.eq('user_id', ownerId)
		.in('stage', ['won', 'lost'])
		.gte('updated_at', since.toISOString());

	const all = deals ?? [];
	const won = all.filter(d => d.stage === 'won');
	const lost = all.filter(d => d.stage === 'lost');

	// Win rate
	const winRate = all.length ? Math.round(won.length / all.length * 100) : 0;

	// Revenue
	const wonRevenue = won.reduce((s, d) => s + (d.value ?? 0), 0);
	const avgDealSize = won.length ? wonRevenue / won.length : 0;

	// Lost reasons breakdown
	const lostReasons: Record<string, number> = {};
	for (const d of lost) {
		const r = d.lost_reason ?? 'Unknown';
		lostReasons[r] = (lostReasons[r] ?? 0) + 1;
	}

	// Monthly trend
	const monthlyMap: Record<string, { won: number; lost: number; revenue: number }> = {};
	for (const d of all) {
		const dt = new Date(d.won_at ?? d.lost_at ?? d.created_at);
		const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
		if (!monthlyMap[key]) monthlyMap[key] = { won: 0, lost: 0, revenue: 0 };
		if (d.stage === 'won') { monthlyMap[key].won++; monthlyMap[key].revenue += d.value ?? 0; }
		else monthlyMap[key].lost++;
	}

	// Pipeline stage conversion (from all deals including open)
	const { data: allDeals } = await supabaseAdmin.from('deals').select('stage').eq('user_id', ownerId);
	const stageMap: Record<string, number> = {};
	for (const d of allDeals ?? []) { stageMap[d.stage] = (stageMap[d.stage] ?? 0) + 1; }

	return json({
		period,
		wonCount: won.length,
		lostCount: lost.length,
		winRate,
		wonRevenue,
		avgDealSize,
		lostReasons: Object.entries(lostReasons).sort((a,b) => b[1]-a[1]),
		monthly: Object.entries(monthlyMap).map(([month, d]) => ({ month, ...d })).sort((a,b) => a.month.localeCompare(b.month)),
		stageDistribution: stageMap,
	});
};
