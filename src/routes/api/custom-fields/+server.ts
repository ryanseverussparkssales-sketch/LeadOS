import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { data } = await supabaseAdmin.from('contact_field_definitions').select('*').eq('user_id', ownerId).order('sort_order');
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { name, fieldKey, fieldType, options } = await request.json();
	if (!name?.trim() || !fieldKey?.trim()) throw error(400, 'name and fieldKey required');
	const key = fieldKey.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
	const { data, error: e } = await supabaseAdmin.from('contact_field_definitions').insert({ user_id: ownerId, name: name.trim(), field_key: key, field_type: fieldType ?? 'text', options: options ?? null }).select().single();
	if (e) throw error(400, e.message);
	return json(data);
};
