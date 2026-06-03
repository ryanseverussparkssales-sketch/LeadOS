import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	const { data, error: dbErr } = await supabaseAdmin
		.from('contact_tags')
		.select('*')
		.eq('user_id', ownerId)
		.order('name');

	if (dbErr) return json([]);
	return json(data);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { name, color } = await request.json();

	if (!name?.trim()) throw error(400, 'Tag name required');

	const { data, error: dbErr } = await supabaseAdmin
		.from('contact_tags')
		.insert({ user_id: user.id, name: name.trim(), color: color ?? '#888888' })
		.select()
		.single();

	if (dbErr) throw error(400, dbErr.message);
	return json(data);
};
