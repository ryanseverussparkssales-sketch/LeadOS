import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// GET: fetch my profile
export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { data } = await supabaseAdmin
		.from('rep_profiles')
		.select('*')
		.eq('user_id', user.id)
		.maybeSingle();
	return json(data ?? null);
};

// POST/PUT: upsert my profile
export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const body = await request.json();
	const allowed = [
		'username', 'display_name', 'bio', 'location',
		'specialties', 'hourly_rate', 'availability', 'is_public',
		'years_experience', 'previous_roles', 'top_achievement', 'certifications',
	];
	const update: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() };
	for (const k of allowed) {
		if (k in body) update[k] = body[k];
	}

	// Validate username
	if (update.username) {
		const username = String(update.username).toLowerCase().replace(/[^a-z0-9_-]/g, '');
		update.username = username;
		const { data: existing } = await supabaseAdmin
			.from('rep_profiles').select('user_id').eq('username', username).maybeSingle();
		if (existing && existing.user_id !== user.id) throw error(409, 'Username taken');
	}
	return json({ success: true });
};
