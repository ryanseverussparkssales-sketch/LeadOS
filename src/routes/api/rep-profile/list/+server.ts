import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// Public endpoint — lists all public rep profiles with aggregated stats
export const GET: RequestHandler = async ({ url }) => {
	const specialty = url.searchParams.get('specialty');
	const availability = url.searchParams.get('availability');

	let q = supabaseAdmin
		.from('rep_profiles')
		.select('username, display_name, bio, location, specialties, hourly_rate, availability, interview_score, roleplay_unlocked, user_id')
		.eq('is_public', true)
		.order('interview_score', { ascending: false, nullsFirst: false })
		.limit(50);

	if (availability && availability !== 'all') q = q.eq('availability', availability);
	if (specialty) q = q.contains('specialties', [specialty]);

	const { data: profiles } = await q;
	if (!profiles?.length) return json([]);

	// Fetch 90-day stats for each profile
	const since = new Date(Date.now() - 90 * 86400000).toISOString();
	const userIds = profiles.map(p => p.user_id);

	const { data: calls } = await supabaseAdmin
		.from('calls')
		.select('user_id, outcome')
		.in('user_id', userIds)
		.gte('created_at', since);

	const WIN = new Set(['appointment_set','demo_scheduled','meeting_confirmed','signed_up','callback']);
	const ANSWERED = new Set(['answered','appointment_set','demo_scheduled','meeting_confirmed','signed_up','callback','not_interested']);

	const statsMap = new Map<string, { totalCalls: number; overallConnectRate: number; overallWinRate: number }>();
	for (const uid of userIds) {
		const userCalls = (calls ?? []).filter(c => c.user_id === uid);
		const answered = userCalls.filter(c => ANSWERED.has(c.outcome ?? '')).length;
		const wins = userCalls.filter(c => WIN.has(c.outcome ?? '')).length;
		statsMap.set(uid, {
			totalCalls: userCalls.length,
			overallConnectRate: userCalls.length > 0 ? Math.round((answered / userCalls.length) * 100) : 0,
			overallWinRate: answered > 0 ? Math.round((wins / answered) * 100) : 0,
		});
	}

	const result = profiles.map(p => ({
		...p,
		user_id: undefined, // don't expose
		stats: statsMap.get(p.user_id) ?? null,
	}));

	return json(result);
};
