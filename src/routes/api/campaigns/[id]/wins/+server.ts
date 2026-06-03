import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);

	// Total wins + wins by rep
	const { data: wins } = await supabaseAdmin
		.from('campaign_wins')
		.select('user_id, outcome, weight, created_at')
		.eq('campaign_id', params.id)
		.order('created_at', { ascending: false });

	if (!wins || wins.length === 0) return json({ total: 0, totalWeighted: 0, byRep: [], byOutcome: [] });

	// Aggregate by user
	const repMap: Record<string, { user_id: string; wins: number; weighted_wins: number; outcomes: Record<string, number> }> = {};
	const outcomeMap: Record<string, number> = {};

	for (const win of wins) {
		const uid = win.user_id ?? 'unknown';
		if (!repMap[uid]) repMap[uid] = { user_id: uid, wins: 0, weighted_wins: 0, outcomes: {} };
		repMap[uid].wins += 1;
		repMap[uid].weighted_wins += win.weight ?? 1;
		repMap[uid].outcomes[win.outcome] = (repMap[uid].outcomes[win.outcome] ?? 0) + 1;
		outcomeMap[win.outcome] = (outcomeMap[win.outcome] ?? 0) + 1;
	}

	// Fetch user display names — try profiles first, fall back gracefully
	const userIds = Object.keys(repMap).filter(id => id !== 'unknown');
	let profileMap: Record<string, { full_name?: string; email?: string }> = {};

	if (userIds.length > 0) {
		// Try profiles table (may not exist in all deployments)
		const { data: profiles, error: profilesError } = await supabaseAdmin
			.from('profiles')
			.select('id, full_name, email')
			.in('id', userIds);

		if (!profilesError && profiles) {
			for (const p of profiles) profileMap[p.id] = p;
		} else {
			// Fall back to auth.admin.listUsers for display names
			for (const uid of userIds) {
				const { data: authData } = await supabaseAdmin.auth.admin.getUserById(uid);
				if (authData?.user) {
					profileMap[uid] = {
						full_name: authData.user.user_metadata?.full_name ?? authData.user.user_metadata?.name,
						email: authData.user.email,
					};
				}
			}
		}
	}

	const byRep = Object.values(repMap)
		.map(r => ({
			...r,
			name: profileMap[r.user_id]?.full_name ?? profileMap[r.user_id]?.email ?? (r.user_id === 'unknown' ? 'Unknown' : r.user_id.slice(0, 8) + '…'),
			isCurrentUser: r.user_id === user.id,
		}))
		.sort((a, b) => b.weighted_wins - a.weighted_wins);

	const byOutcome = Object.entries(outcomeMap).map(([outcome, count]) => ({ outcome, count }));
	const totalWeighted = wins.reduce((sum, w) => sum + (w.weight ?? 1), 0);

	return json({ total: wins.length, totalWeighted, byRep, byOutcome });
};
