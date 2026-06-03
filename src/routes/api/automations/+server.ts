import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { data } = await supabaseAdmin.from('automation_rules').select('*').eq('user_id', ownerId).order('created_at', { ascending: false });
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { name, triggerType, conditions, actions } = await request.json();
	if (!name?.trim() || !triggerType) throw error(400, 'name and triggerType required');
	const { data, error: e } = await supabaseAdmin.from('automation_rules').insert({ user_id: ownerId, name: name.trim(), trigger_type: triggerType, conditions: conditions ?? [], actions: actions ?? [] }).select().single();
	if (e) throw error(400, e.message);
	return json(data);
};
