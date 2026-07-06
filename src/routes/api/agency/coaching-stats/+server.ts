import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

/**
 * Aggregate coaching stats for the agency — last 30 days, per rep:
 *   calls, avg AI quality score (0–10), scored-call count,
 *   coached-call count (has feedback), avg manager rating (1–5).
 *
 * 3 queries total regardless of team size.
 */
export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const since = new Date(Date.now() - 30 * 86400000).toISOString();

	const { data: team } = await supabaseAdmin
		.from('team_members')
		.select('member_email, member_user_id')
		.eq('owner_user_id', ownerId)
		.eq('role', 'sdr')
		.limit(100);

	const userIds = [ownerId, ...(team ?? []).map(m => m.member_user_id).filter(Boolean)] as string[];
	const emailByUser = new Map<string, string>();
	for (const m of team ?? []) if (m.member_user_id) emailByUser.set(m.member_user_id, m.member_email);

	const { data: calls } = await supabaseAdmin
		.from('calls')
		.select('id, user_id, quality_score')
		.in('user_id', userIds)
		.gte('created_at', since)
		.limit(10000);

	const callIds = (calls ?? []).map(c => c.id);
	let feedback: { call_id: string; rating: number | null }[] = [];
	if (callIds.length > 0) {
		// call_feedback is small; scope by reviewer (the owner) + created window instead of a giant IN list
		const { data: fb } = await supabaseAdmin
			.from('call_feedback')
			.select('call_id, rating')
			.eq('reviewer_user_id', ownerId)
			.gte('created_at', since)
			.limit(10000);
		const idSet = new Set(callIds);
		feedback = (fb ?? []).filter(f => idSet.has(f.call_id));
	}

	type Agg = { calls: number; scored: number; scoreSum: number; coached: Set<string>; ratingSum: number; rated: number };
	const byUser = new Map<string, Agg>();
	const agg = (uid: string): Agg => {
		if (!byUser.has(uid)) byUser.set(uid, { calls: 0, scored: 0, scoreSum: 0, coached: new Set(), ratingSum: 0, rated: 0 });
		return byUser.get(uid)!;
	};

	const callOwner = new Map<string, string>();
	for (const c of calls ?? []) {
		callOwner.set(c.id, c.user_id);
		const a = agg(c.user_id);
		a.calls++;
		if (c.quality_score !== null && c.quality_score !== undefined) {
			a.scored++;
			a.scoreSum += Number(c.quality_score);
		}
	}
	for (const f of feedback) {
		const uid = callOwner.get(f.call_id);
		if (!uid) continue;
		const a = agg(uid);
		a.coached.add(f.call_id);
		if (f.rating !== null && f.rating !== undefined) {
			a.rated++;
			a.ratingSum += Number(f.rating);
		}
	}

	const reps = [...byUser.entries()].map(([uid, a]) => ({
		user_id: uid,
		email: uid === ownerId ? 'You (owner)' : (emailByUser.get(uid) ?? 'Unknown'),
		calls: a.calls,
		scoredCalls: a.scored,
		avgQualityScore: a.scored > 0 ? Math.round((a.scoreSum / a.scored) * 10) / 10 : null,
		coachedCalls: a.coached.size,
		coverage: a.calls > 0 ? Math.round((a.coached.size / a.calls) * 100) : 0,
		avgRating: a.rated > 0 ? Math.round((a.ratingSum / a.rated) * 10) / 10 : null,
	})).sort((x, y) => y.calls - x.calls);

	return json({ since, reps });
};
