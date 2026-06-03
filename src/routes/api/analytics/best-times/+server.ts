import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	// Fetch all calls with timestamps and outcomes
	const { data: calls } = await supabaseAdmin
		.from('calls')
		.select('created_at, outcome, call_duration_seconds')
		.eq('user_id', ownerId)
		.not('started_at', 'is', null)
		.limit(2000);

	const callList = calls ?? [];

	// Build 7×24 grid: day[0-6] × hour[0-23]
	const grid: Record<string, { total: number; answered: number; totalDuration: number }> = {};

	for (const c of callList) {
		const d = new Date(c.created_at);
		const day  = d.getDay();   // 0=Sun, 6=Sat
		const hour = d.getHours(); // 0-23
		const key  = `${day}_${hour}`;
		if (!grid[key]) grid[key] = { total: 0, answered: 0, totalDuration: 0 };
		grid[key].total++;
		if (c.outcome === 'answered' || c.outcome === 'callback') grid[key].answered++;
		grid[key].totalDuration += c.call_duration_seconds ?? 0;
	}

	// Convert to array with answer rate
	const heatmap = Object.entries(grid).map(([key, d]) => {
		const [day, hour] = key.split('_').map(Number);
		return {
			day, hour,
			total: d.total,
			answered: d.answered,
			answerRate: d.total > 0 ? Math.round(d.answered / d.total * 100) : 0,
			avgDuration: d.total > 0 ? Math.round(d.totalDuration / d.total) : 0,
		};
	});

	// Best hours (sorted by answer rate, min 3 calls)
	const bestHours = [...heatmap]
		.filter(h => h.total >= 3)
		.sort((a, b) => b.answerRate - a.answerRate)
		.slice(0, 5);

	return json({ heatmap, bestHours, totalCalls: callList.length });
};
