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

	// Verify the tag belongs to the caller BEFORE touching mappings. Previously
	// the mapping delete ran unscoped by tag_id, so passing another tenant's tag_id
	// stripped that tag from all of the victim's contacts (cross-tenant data attack).
	const { data: tag } = await supabaseAdmin
		.from('contact_tags')
		.select('id')
		.eq('id', params.id)
		.eq('user_id', user.id)
		.maybeSingle();
	if (!tag) throw error(404, 'Tag not found');

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
