import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);

	// Calls that used this script
	const { data: calls } = await supabaseAdmin
		.from('calls')
		.select('id, outcome, call_type, call_duration_seconds, created_at')
		.eq('script_id', params.id)
		.eq('user_id', user.id)
		.order('created_at', { ascending: false });

	const callList = calls ?? [];

	// Outcome breakdown
	const outcomes: Record<string, number> = {};
	let totalDuration = 0;
	for (const c of callList) {
		const o = c.outcome ?? 'no_outcome';
		outcomes[o] = (outcomes[o] ?? 0) + 1;
		totalDuration += c.call_duration_seconds ?? 0;
	}

	// Call type breakdown
	const callTypes: Record<string, number> = {};
	for (const c of callList) {
		const t = c.call_type ?? 'cold_call';
		callTypes[t] = (callTypes[t] ?? 0) + 1;
	}

	// Success rate = (answered + callback + interested) / total
	const positive = ['answered', 'callback', 'interested'];
	const successCount = callList.filter(c => positive.includes(c.outcome ?? '')).length;
	const successRate = callList.length ? (successCount / callList.length * 100).toFixed(1) : '0';

	// Answer rate
	const answeredCount = callList.filter(c => c.outcome === 'answered').length;
	const answerRate = callList.length ? (answeredCount / callList.length * 100).toFixed(1) : '0';

	// Callback rate
	const callbackCount = callList.filter(c => c.outcome === 'callback').length;
	const callbackRate = callList.length ? (callbackCount / callList.length * 100).toFixed(1) : '0';

	// Objection frequency
	const { data: objLogs } = await supabaseAdmin
		.from('script_objection_logs')
		.select('objection_id, objection:script_objections(objection)')
		.eq('script_id', params.id);

	const objFrequency: Record<string, { count: number; text: string }> = {};
	for (const log of objLogs ?? []) {
		const id = log.objection_id;
		const text = (log.objection as { objection: string })?.objection ?? id;
		if (!objFrequency[id]) objFrequency[id] = { count: 0, text };
		objFrequency[id].count++;
	}

	// Sort objections by frequency
	const topObjections = Object.values(objFrequency)
		.sort((a, b) => b.count - a.count)
		.slice(0, 10);

	// Weekly trend (last 8 weeks)
	const weeklyMap: Record<string, { total: number; success: number }> = {};
	for (const c of callList) {
		const d = new Date(c.created_at);
		const weekStart = new Date(d); weekStart.setDate(d.getDate() - d.getDay());
		const key = weekStart.toISOString().slice(0, 10);
		if (!weeklyMap[key]) weeklyMap[key] = { total: 0, success: 0 };
		weeklyMap[key].total++;
		if (positive.includes(c.outcome ?? '')) weeklyMap[key].success++;
	}

	return json({
		callCount: callList.length,
		outcomes,
		callTypes,
		successRate: parseFloat(successRate),
		answerRate: parseFloat(answerRate),
		callbackRate: parseFloat(callbackRate),
		avgDurationSeconds: callList.length ? Math.round(totalDuration / callList.length) : 0,
		topObjections,
		weeklyTrend: Object.entries(weeklyMap).map(([week, d]) => ({ week, ...d, rate: d.total ? (d.success / d.total * 100).toFixed(0) : '0' })).sort((a, b) => a.week.localeCompare(b.week)).slice(-8),
	});
};
