import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const { name, color } = await request.json();

	const { data, error: dbErr } = await supabaseAdmin
		.from('contact_tags')
		.update({ name: name?.trim(), color })
		.eq('id', params.id)
		.eq('user_id', user.id)
		.select()
		.single();

	if (dbErr) throw error(400, dbErr.message);
	return json(data);
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);

	await supabaseAdmin
		.from('contact_tag_mappings')
		.delete()
		.eq('tag_id', params.id);

	const { error: dbErr } = await supabaseAdmin
		.from('contact_tags')
		.delete()
		.eq('id', params.id)
		.eq('user_id', user.id);

	if (dbErr) throw error(400, dbErr.message);
	return json({ success: true });
};
