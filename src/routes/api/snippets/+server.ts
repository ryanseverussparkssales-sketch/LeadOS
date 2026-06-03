import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { data } = await supabaseAdmin.from('snippets').select('*').eq('user_id', ownerId).order('trigger');
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { trigger, title, content } = await request.json();
	if (!trigger?.trim() || !content?.trim()) throw error(400, 'trigger and content required');
	const t = trigger.startsWith('/') ? trigger : `/${trigger}`;
	const { data, error: e } = await supabaseAdmin.from('snippets').upsert({ user_id: ownerId, trigger: t.toLowerCase(), title: title ?? t, content }, { onConflict: 'user_id,trigger' }).select().single();
	if (e) throw error(400, e.message);
	return json(data);
};
