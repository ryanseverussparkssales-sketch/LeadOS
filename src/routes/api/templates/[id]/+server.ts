import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const body = await request.json();
	const { data, error: e } = await supabaseAdmin.from('templates').update(body).eq('id', params.id).eq('user_id', ownerId).select().single();
	if (e) throw error(400, e.message);
	return json(data);
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	await supabaseAdmin.from('templates').delete().eq('id', params.id).eq('user_id', ownerId);
	return json({ success: true });
};

// PATCH: increment use count
export const PATCH: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { data } = await supabaseAdmin.from('templates').select('use_count').eq('id', params.id).eq('user_id', ownerId).single();
	if (!data) throw error(404, 'Template not found');
	await supabaseAdmin.from('templates').update({ use_count: (data.use_count ?? 0) + 1 }).eq('id', params.id).eq('user_id', ownerId);
	return json({ success: true });
};
