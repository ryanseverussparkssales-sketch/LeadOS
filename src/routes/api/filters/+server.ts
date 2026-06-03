import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { data } = await supabaseAdmin
		.from('contact_filters')
		.select('*')
		.eq('user_id', user.id)
		.order('name');
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { name, filter_config } = await request.json();
	if (!name?.trim()) throw error(400, 'Name required');

	const { data, error: dbErr } = await supabaseAdmin
		.from('contact_filters')
		.upsert({ user_id: user.id, name: name.trim(), filter_config }, { onConflict: 'user_id,name' })
		.select()
		.single();

	if (dbErr) throw error(400, dbErr.message);
	return json(data);
};
