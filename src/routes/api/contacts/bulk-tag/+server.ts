import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { contact_ids, tag_id } = await request.json();
	if (!contact_ids?.length || !tag_id) throw error(400, 'contact_ids and tag_id required');

	// Verify all contacts belong to user
	const { data: contacts } = await supabaseAdmin
		.from('contacts').select('id').in('id', contact_ids).eq('user_id', user.id);

	const validIds = contacts?.map(c => c.id) ?? [];
	if (!validIds.length) return json({ tagged: 0 });

	const rows = validIds.map(contact_id => ({ contact_id, tag_id }));
	await supabaseAdmin.from('contact_tag_mappings').upsert(rows, { onConflict: 'contact_id,tag_id' });

	return json({ tagged: validIds.length });
};
