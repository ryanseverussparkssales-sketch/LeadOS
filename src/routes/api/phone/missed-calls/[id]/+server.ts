import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const body = await request.json();
	if (body.returned && !body.returned_at) body.returned_at = new Date().toISOString();
	const { data, error: e } = await supabaseAdmin
		.from('missed_calls').update(body).eq('id', params.id).eq('user_id', user.id).select().single();
	if (e) throw error(400, e.message);
	return json(data);
};
