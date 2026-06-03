import { json, error } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// Public endpoint — no auth required
export const GET: RequestHandler = async ({ url }) => {
	const username = url.searchParams.get('username');
	if (!username) throw error(400, 'username required');

	const { data: profile } = await supabaseAdmin
		.from('rep_profiles')
		.select('username, display_name, bio, location, specialties, hourly_rate, availability, interview_score, roleplay_unlocked')
		.eq('username', username.toLowerCase())
		.eq('is_public', true)
		.maybeSingle();

	if (!profile) throw error(404, 'Profile not found');

	// Supercut clips
	const { data: clips } = await supabaseAdmin
		.from('rep_supercut_clips')
		.select('id, clip_type, transcript_excerpt, ai_reason, recording_url')
		.eq('user_id', (await supabaseAdmin.from('rep_profiles').select('user_id').eq('username', username).single()).data?.user_id ?? '')
		.limit(6);

	// Aggregate stats (public-safe)
	const userRow = await supabaseAdmin.from('rep_profiles').select('user_id').eq('username', username).single();
	const userId = userRow.data?.user_id;
	let stats = null;
	if (userId) {
		const { data: callStats } = await supabaseAdmin
			.from('calls')
			.select('outcome, call_duration_seconds')
			.eq('user_id', userId)
			.gte('created_at', new Date(Date.now() - 90 * 86400000).toISOString());

		if (callStats?.length) {
			const WIN = new Set(['appointment_set','demo_scheduled','meeting_confirmed','signed_up','callback']);
			const ANSWERED = new Set(['answered','appointment_set','demo_scheduled','meeting_confirmed','signed_up','callback','not_interested']);
			const answered = callStats.filter(c => ANSWERED.has(c.outcome ?? '')).length;
			const wins = callStats.filter(c => WIN.has(c.outcome ?? '')).length;
			stats = {
				totalCalls: callStats.length,
				overallConnectRate: callStats.length > 0 ? Math.round((answered / callStats.length) * 100) : 0,
				overallWinRate: answered > 0 ? Math.round((wins / answered) * 100) : 0,
			};
		}
	}

	return json({ profile, clips: clips ?? [], stats });
};
