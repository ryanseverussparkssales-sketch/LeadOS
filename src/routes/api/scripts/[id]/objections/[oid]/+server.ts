import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const body = await request.json();
	const { data, error: e } = await supabaseAdmin.from('script_objections').update(body).eq('id', params.oid).select().single();
	if (e) throw error(400, e.message);
	return json(data);
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	await requireAuth(request);
	await supabaseAdmin.from('script_objections').delete().eq('id', params.oid);
	return json({ success: true });
};
