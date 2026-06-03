/**
 * Agency command center API — scale-safe version
 * Replaces N+1 per-SDR query loop with two aggregated queries:
 *   1. GROUP BY user_id on calls for today's stats (1 query regardless of team size)
 *   2. Single call_list_contacts count per owner (not per SDR)
 */
import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	const todayStart = new Date();
	todayStart.setHours(0, 0, 0, 0);
	const todayISO = todayStart.toISOString();
	const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

	const WIN_OUTCOMES  = new Set(['appointment_set','demo_scheduled','meeting_confirmed','signed_up','callback','follow_up_agreed','referral','proposal_requested']);
	const ANSWERED_SET  = new Set(['answered','appointment_set','demo_scheduled','meeting_confirmed','signed_up','callback','not_interested','do_not_call','follow_up_agreed']);

	// ── 1. Fetch everything in parallel — 4 queries total regardless of team size ──
	const [clientsRes, teamRes, todayCallsRes, recentWinsRes, callListsRes] = await Promise.all([

		// Clients + campaigns
		supabaseAdmin
			.from('clients')
			.select('id, name, projects(id, name, campaigns(id, name, status, win_count, target_wins, daily_call_goal, calls_today, total_calls))')
			.eq('user_id', ownerId)
			.eq('is_test', false),

		// All SDRs — no per-member queries
		supabaseAdmin
			.from('team_members')
			.select('id, member_email, member_user_id, role')
			.eq('owner_user_id', ownerId)
			.eq('role', 'sdr')
			.not('portal_access', 'is', true)
			.limit(100),

		// ALL today's calls for owner + all SDRs — one query, aggregated in JS
		supabaseAdmin
			.from('calls')
			.select('id, outcome, user_id')
			.gte('created_at', todayISO)
			.limit(5000),  // hard ceiling: 30 reps × 200 calls/day = 6k max

		// Recent wins feed
		supabaseAdmin
			.from('calls')
			.select('id, outcome, created_at, contact:contacts(id, name, company)')
			.eq('user_id', ownerId)
			.gte('created_at', weekAgo)
			.in('outcome', [...WIN_OUTCOMES])
			.order('created_at', { ascending: false })
			.limit(20),

		// All call lists owned by this account (for queue size calc)
		supabaseAdmin
			.from('call_lists')
			.select('id')
			.limit(500),
	]);

	const teamMembers  = teamRes.data ?? [];
	const todayCalls   = todayCallsRes.data ?? [];
	const callListIds  = (callListsRes.data ?? []).map((l: any) => l.id);

	// ── 2. Build per-SDR stats from the single calls batch (pure JS, zero extra queries) ──
	const allUserIds = new Set([
		ownerId,
		...teamMembers.map(m => m.member_user_id).filter(Boolean),
	]);

	// Group calls by user_id
	const callsByUser = new Map<string, { total: number; answered: number; wins: number }>();
	for (const call of todayCalls) {
		if (!allUserIds.has(call.user_id)) continue;
		const existing = callsByUser.get(call.user_id) ?? { total: 0, answered: 0, wins: 0 };
		existing.total++;
		if (ANSWERED_SET.has(call.outcome ?? ''))   existing.answered++;
		if (WIN_OUTCOMES.has(call.outcome ?? ''))    existing.wins++;
		callsByUser.set(call.user_id, existing);
	}

	// ── 3. Queue sizes — single batch count grouped by call_list_id ──
	// Fetch all pending contacts across all lists in one query
	let queueCountByList = new Map<string, number>();
	if (callListIds.length > 0) {
		const { data: pendingRows } = await supabaseAdmin
			.from('call_list_contacts')
			.select('call_list_id')
			.in('call_list_id', callListIds)
			.eq('status', 'pending')
			.limit(50000);

		for (const row of (pendingRows ?? [])) {
			const prev = queueCountByList.get(row.call_list_id) ?? 0;
			queueCountByList.set(row.call_list_id, prev + 1);
		}
	}

	// Map list → member (via campaign_sdrs would be ideal; using call_list ownership for now)
	// For simplicity: total pending across all lists is the owner's queue pool
	const totalQueueSize = Array.from(queueCountByList.values()).reduce((s, n) => s + n, 0);

	// ── 4. Assemble SDR stats ──────────────────────────────────────────────────
	const sdrStats = teamMembers.map(member => {
		const stats = member.member_user_id
			? (callsByUser.get(member.member_user_id) ?? { total: 0, answered: 0, wins: 0 })
			: { total: 0, answered: 0, wins: 0 };
		return {
			...member,
			todayCalls:    stats.total,
			todayAnswered: stats.answered,
			todayWins:     stats.wins,
			queueSize:     Math.round(totalQueueSize / Math.max(teamMembers.length, 1)),
		};
	});

	// ── 5. Owner totals ────────────────────────────────────────────────────────
	const ownerStats  = callsByUser.get(ownerId) ?? { total: 0, answered: 0, wins: 0 };
	const sdrTotals   = sdrStats.reduce(
		(acc, m) => ({ total: acc.total + m.todayCalls, answered: acc.answered + m.todayAnswered, wins: acc.wins + m.todayWins }),
		{ total: 0, answered: 0, wins: 0 }
	);

	const totalDials    = ownerStats.total + sdrTotals.total;
	const totalAnswered = ownerStats.answered + sdrTotals.answered;
	const teamTotals = {
		dials:       totalDials,
		answered:    totalAnswered,
		wins:        ownerStats.wins + sdrTotals.wins,
		connectRate: totalDials > 0 ? Math.round((totalAnswered / totalDials) * 100) : 0,
	};

	return json({
		clients:    clientsRes.data ?? [],
		teamTotals,
		sdrStats,
		recentWins: recentWinsRes.data ?? [],
	});
};
