import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { data } = await supabaseAdmin.from('outbound_webhooks').select('*').eq('user_id', ownerId).order('created_at', { ascending: false });
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { name, url, events, secret } = await request.json();
	if (!name?.trim() || !url?.trim()) throw error(400, 'name and url required');
	const { data, error: e } = await supabaseAdmin.from('outbound_webhooks').insert({ user_id: ownerId, name: name.trim(), url, events: events ?? ['lead_arrived'], secret: secret ?? null }).select().single();
	if (e) throw error(400, e.message);
	return json(data);
};
