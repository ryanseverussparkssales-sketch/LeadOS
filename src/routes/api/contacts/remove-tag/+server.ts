import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { contact_id, tag_id } = await request.json();
	if (!contact_id || !tag_id) throw error(400, 'contact_id and tag_id required');

	const { data: contact } = await supabaseAdmin
		.from('contacts').select('id').eq('id', contact_id).eq('user_id', user.id).single();
	if (!contact) throw error(403, 'Forbidden');

	await supabaseAdmin
		.from('contact_tag_mappings')
		.delete()
		.eq('contact_id', contact_id)
		.eq('tag_id', tag_id);

	return json({ success: true });
};
