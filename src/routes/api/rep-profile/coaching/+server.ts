import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);

	// Fetch last 90 days of calls
	const since = new Date(Date.now() - 90 * 86400000).toISOString();
	const { data: calls } = await supabaseAdmin
		.from('calls')
		.select('id, outcome, call_duration_seconds, created_at, quality_score, raw_transcript')
		.eq('user_id', user.id)
		.gte('created_at', since)
		.order('created_at', { ascending: true });

	if (!calls?.length) return json({ hasData: false });

	const WIN_OUTCOMES = new Set(['appointment_set','demo_scheduled','meeting_confirmed','signed_up','callback']);
	const ANSWERED_OUTCOMES = new Set(['answered','appointment_set','demo_scheduled','meeting_confirmed','signed_up','callback','not_interested','follow_up']);

	// Group by week
	interface WeekStats {
		week: string;
		calls: number;
		answered: number;
		wins: number;
		totalDuration: number;
		connectRate: number;
		winRate: number;
		avgDuration: number;
	}

	const weekMap = new Map<string, WeekStats>();

	for (const call of calls) {
		const d = new Date(call.created_at);
		const weekStart = new Date(d);
		weekStart.setDate(d.getDate() - d.getDay()); // Sunday
		const week = weekStart.toISOString().split('T')[0];

		if (!weekMap.has(week)) {
			weekMap.set(week, { week, calls: 0, answered: 0, wins: 0, totalDuration: 0, connectRate: 0, winRate: 0, avgDuration: 0 });
		}
		const s = weekMap.get(week)!;
		s.calls++;
		if (ANSWERED_OUTCOMES.has(call.outcome ?? '')) s.answered++;
		if (WIN_OUTCOMES.has(call.outcome ?? '')) s.wins++;
		s.totalDuration += call.call_duration_seconds ?? 0;
	}

	// Compute rates
	const weeks: WeekStats[] = [];
	for (const s of weekMap.values()) {
		s.connectRate = s.calls > 0 ? Math.round((s.answered / s.calls) * 100) : 0;
		s.winRate = s.answered > 0 ? Math.round((s.wins / s.answered) * 100) : 0;
		s.avgDuration = s.answered > 0 ? Math.round(s.totalDuration / s.answered) : 0;
		weeks.push(s);
	}
	weeks.sort((a, b) => a.week.localeCompare(b.week));

	// Find personal best week
	const bestWeek = [...weeks].sort((a, b) =>
		(b.winRate * 2 + b.connectRate + b.calls / 10) - (a.winRate * 2 + a.connectRate + a.calls / 10)
	)[0];

	// Current week (last 7 days)
	const thisWeek = weeks[weeks.length - 1] ?? null;
	const lastWeek = weeks[weeks.length - 2] ?? null;

	// Coaching insights vs personal best
	const insights: string[] = [];
	if (thisWeek && bestWeek && thisWeek.week !== bestWeek.week) {
		if (thisWeek.connectRate < bestWeek.connectRate - 5)
			insights.push(`Your connect rate (${thisWeek.connectRate}%) is ${bestWeek.connectRate - thisWeek.connectRate}pp below your best week. Your best was ${bestWeek.week} at ${bestWeek.connectRate}%.`);
		if (thisWeek.winRate < bestWeek.winRate - 5)
			insights.push(`Win rate is down vs your best — ${thisWeek.winRate}% now vs ${bestWeek.winRate}% in your best week (${bestWeek.week}).`);
		if (thisWeek.avgDuration < bestWeek.avgDuration * 0.7)
			insights.push(`Your calls are shorter than your best week. In ${bestWeek.week} your average connected call was ${Math.round(bestWeek.avgDuration / 60)}m — now it's ${Math.round(thisWeek.avgDuration / 60)}m. Shorter calls usually mean less discovery.`);
		if (thisWeek.calls >= bestWeek.calls * 0.9 && thisWeek.winRate >= bestWeek.winRate * 0.9)
			insights.push(`You're tracking close to your best week. Keep the volume up.`);
	}

	if (insights.length === 0 && thisWeek) {
		insights.push(`You're having a solid week. ${thisWeek.calls} calls, ${thisWeek.connectRate}% connect rate, ${thisWeek.winRate}% win rate.`);
	}

	// Trend vs last week
	let trend: 'up' | 'down' | 'flat' = 'flat';
	if (thisWeek && lastWeek) {
		const delta = thisWeek.winRate - lastWeek.winRate;
		if (delta >= 3) trend = 'up';
		else if (delta <= -3) trend = 'down';
	}

	return json({
		hasData: true,
		weeks,
		thisWeek,
		lastWeek,
		bestWeek,
		trend,
		insights,
		totalCalls: calls.length,
		overallConnectRate: Math.round(
			weeks.reduce((s, w) => s + w.answered, 0) /
			Math.max(weeks.reduce((s, w) => s + w.calls, 0), 1) * 100
		),
		overallWinRate: Math.round(
			weeks.reduce((s, w) => s + w.wins, 0) /
			Math.max(weeks.reduce((s, w) => s + w.answered, 0), 1) * 100
		),
	});
};
