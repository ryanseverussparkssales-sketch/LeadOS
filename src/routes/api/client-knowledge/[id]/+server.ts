import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const body = await request.json();
	const { data, error: e } = await supabaseAdmin
		.from('client_knowledge').update(body).eq('id', params.id).eq('user_id', user.id).select().single();
	if (e) throw error(400, e.message);
	return json(data);
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	await supabaseAdmin.from('client_knowledge').delete().eq('id', params.id).eq('user_id', user.id);
	return json({ success: true });
};
