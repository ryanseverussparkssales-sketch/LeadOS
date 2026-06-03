import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const body = await request.json();
	const { data, error: e } = await supabaseAdmin.from('outbound_webhooks').update(body).eq('id', params.id).eq('user_id', ownerId).select().single();
	if (e) throw error(400, e.message);
	return json(data);
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	await supabaseAdmin.from('outbound_webhooks').delete().eq('id', params.id).eq('user_id', ownerId);
	return json({ success: true });
};
