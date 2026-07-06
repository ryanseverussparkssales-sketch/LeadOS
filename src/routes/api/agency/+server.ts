/**
 * Agency command center API — scale-safe version
 * Constant query count regardless of team size (no N+1):
 *   1. Team members first (cheap) so the calls query can be scoped to this tenant
 *   2. One aggregated calls fetch grouped by user_id in JS for today's stats
 *   3. One pending-contacts fetch grouped by call_list_id, mapped to SDRs via
 *      campaign_sdrs → call_lists.campaign_id (real per-SDR queue depth)
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

	// ── 1. Team members first (cheap, ≤100 rows) — needed to scope the calls query ──
	const teamRes = await supabaseAdmin
		.from('team_members')
		.select('id, member_email, member_user_id, role')
		.eq('owner_user_id', ownerId)
		.eq('role', 'sdr')
		.not('portal_access', 'is', true)
		.limit(100);

	const teamMembers = teamRes.data ?? [];
	const allUserIds = new Set([
		ownerId,
		...teamMembers.map(m => m.member_user_id).filter(Boolean),
	]);

	// ── 2. Remaining fetches in parallel — constant query count regardless of team size ──
	const [clientsRes, todayCallsRes, recentWinsRes, callListsRes, campaignSdrsRes] = await Promise.all([

		// Clients + campaigns
		supabaseAdmin
			.from('clients')
			.select('id, name, projects(id, name, campaigns(id, name, status, win_count, target_wins, daily_call_goal, calls_today, total_calls))')
			.eq('user_id', ownerId)
			.eq('is_test', false),

		// Today's calls for owner + this owner's SDRs only — one query, aggregated in JS
		supabaseAdmin
			.from('calls')
			.select('id, outcome, user_id')
			.in('user_id', [...allUserIds])
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

		// Call lists + campaign linkage (schema: call_lists.campaign_id → campaigns.id)
		supabaseAdmin
			.from('call_lists')
			.select('id, campaign_id')
			.limit(500),

		// Campaign ↔ SDR assignments for this owner (campaign_sdrs.sdr_id → team_members.id)
		supabaseAdmin
			.from('campaign_sdrs')
			.select('campaign_id, sdr_id')
			.eq('owner_user_id', ownerId)
			.limit(1000),
	]);

	const todayCalls = todayCallsRes.data ?? [];

	// Owner's campaign ids (from the clients tree) — scopes call lists to this tenant
	const ownerCampaignIds = new Set<string>();
	for (const client of (clientsRes.data ?? []) as any[]) {
		for (const project of client.projects ?? []) {
			for (const campaign of project.campaigns ?? []) ownerCampaignIds.add(campaign.id);
		}
	}

	// campaign → its call lists (only this owner's campaign-linked lists)
	const listsByCampaign = new Map<string, string[]>();
	const callListIds: string[] = [];
	for (const list of (callListsRes.data ?? []) as any[]) {
		if (!list.campaign_id || !ownerCampaignIds.has(list.campaign_id)) continue;
		callListIds.push(list.id);
		const lists = listsByCampaign.get(list.campaign_id) ?? [];
		lists.push(list.id);
		listsByCampaign.set(list.campaign_id, lists);
	}

	// ── 3. Build per-SDR stats from the single calls batch (pure JS, zero extra queries) ──

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

	// ── 4. Queue sizes — single batch count grouped by call_list_id ──
	// Fetch all pending contacts across this owner's campaign-linked lists in one query
	const queueCountByList = new Map<string, number>();
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

	// ── 5. Real per-SDR queue depth ────────────────────────────────────────────
	// SDR → their campaigns (campaign_sdrs) → those campaigns' call lists → sum of
	// pending contacts. An SDR assigned to no campaign gets 0.
	// NOTE: a list shared by multiple SDRs counts toward EACH of them — queueSize
	// is "leads this rep can dial", a shared pool, not a partition of it.
	const campaignsBySdr = new Map<string, string[]>();
	for (const row of (campaignSdrsRes.data ?? []) as any[]) {
		const campaigns = campaignsBySdr.get(row.sdr_id) ?? [];
		campaigns.push(row.campaign_id);
		campaignsBySdr.set(row.sdr_id, campaigns);
	}

	const queueSizeForSdr = (teamMemberId: string): number => {
		let total = 0;
		for (const campaignId of campaignsBySdr.get(teamMemberId) ?? []) {
			for (const listId of listsByCampaign.get(campaignId) ?? []) {
				total += queueCountByList.get(listId) ?? 0;
			}
		}
		return total;
	};

	// ── 6. Assemble SDR stats ──────────────────────────────────────────────────
	const sdrStats = teamMembers.map(member => {
		const stats = member.member_user_id
			? (callsByUser.get(member.member_user_id) ?? { total: 0, answered: 0, wins: 0 })
			: { total: 0, answered: 0, wins: 0 };
		return {
			...member,
			todayCalls:    stats.total,
			todayAnswered: stats.answered,
			todayWins:     stats.wins,
			queueSize:     queueSizeForSdr(member.id),
		};
	});

	// ── 7. Owner totals ────────────────────────────────────────────────────────
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
