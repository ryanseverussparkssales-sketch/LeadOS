import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const period = url.searchParams.get('period') ?? 'month';

	const since = new Date();
	if (period === 'week')  since.setDate(since.getDate() - 7);
	else if (period === 'month') { since.setDate(1); since.setHours(0,0,0,0); }
	else if (period === 'all')   since.setFullYear(2020);
	else since.setHours(0,0,0,0);

	// Fetch team members + all their calls in 2 queries (not N+1)
	const [membersRes, callsRes] = await Promise.all([
		supabaseAdmin
			.from('team_members')
			.select('member_user_id, member_email, role')
			.eq('owner_user_id', ownerId)
			.eq('status', 'active')
			.limit(100),

		// Single query for ALL calls across the whole team in the period
		supabaseAdmin
			.from('calls')
			.select('user_id, outcome, call_duration_seconds, quality_score')
			.eq('user_id', ownerId) // will be OR'd below
			.gte('created_at', since.toISOString())
			.limit(20000),
	]);

	const members = membersRes.data ?? [];
	const allUserIds = [
		ownerId,
		...members.filter(m => m.member_user_id).map(m => m.member_user_id!),
	];

	// One big query for all calls, all agents
	const { data: allCallsData } = await supabaseAdmin
		.from('calls')
		.select('user_id, outcome, call_duration_seconds, quality_score')
		.in('user_id', allUserIds)
		.gte('created_at', since.toISOString())
		.limit(20000);

	const allCalls = allCallsData ?? [];

	// Group calls by user_id in JS — zero extra DB queries
	const callsByUser = new Map<string, typeof allCalls>();
	for (const call of allCalls) {
		const list = callsByUser.get(call.user_id) ?? [];
		list.push(call);
		callsByUser.set(call.user_id, list);
	}

	const agentDefs = [
		{ id: ownerId, email: 'Owner', role: 'owner' },
		...members.filter(m => m.member_user_id).map(m => ({ id: m.member_user_id!, email: m.member_email, role: m.role })),
	];

	const stats = agentDefs.map(agent => {
		const callList = callsByUser.get(agent.id) ?? [];
		const totalCalls    = callList.length;
		const answered      = callList.filter(c => c.outcome === 'answered').length;
		const callbacks     = callList.filter(c => c.outcome === 'callback').length;
		const totalDuration = callList.reduce((s, c) => s + (c.call_duration_seconds ?? 0), 0);
		const avgDuration   = totalCalls ? Math.round(totalDuration / totalCalls) : 0;
		const answerRate    = totalCalls ? Math.round(answered / totalCalls * 100) : 0;
		const callbackRate  = totalCalls ? Math.round(callbacks / totalCalls * 100) : 0;
		const qualityScores = callList.filter(c => c.quality_score != null).map(c => c.quality_score!);
		const avgQuality    = qualityScores.length
			? Math.round(qualityScores.reduce((s, q) => s + q, 0) / qualityScores.length * 10) / 10
			: null;
		const callsPerHour  = totalDuration > 0
			? Math.round(totalCalls / (totalDuration / 3600) * 10) / 10
			: null;
		return { ...agent, totalCalls, answered, callbacks, answerRate, callbackRate, avgDuration, avgQuality, callsPerHour };
	});

	stats.sort((a, b) => b.totalCalls - a.totalCalls);
	return json({ period, agents: stats });
};
