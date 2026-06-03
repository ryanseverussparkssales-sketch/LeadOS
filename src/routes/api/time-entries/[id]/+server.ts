import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const { error: e } = await supabaseAdmin
		.from('time_entries').delete().eq('id', params.id).eq('user_id', user.id);
	if (e) throw error(400, e.message);
	return json({ success: true });
};

export const PATCH: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const body = await request.json();
	const { data, error: e } = await supabaseAdmin
		.from('time_entries')
		.update(body)
		.eq('id', params.id)
		.eq('user_id', user.id)
		.select()
		.single();
	if (e) throw error(400, e.message);
	return json(data);
};
