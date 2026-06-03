import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { contact_id, tag_id } = await request.json();
	if (!contact_id || !tag_id) throw error(400, 'contact_id and tag_id required');

	// Verify ownership
	const { data: contact } = await supabaseAdmin
		.from('contacts').select('id').eq('id', contact_id).eq('user_id', user.id).single();
	if (!contact) throw error(403, 'Forbidden');

	const { error: dbErr } = await supabaseAdmin
		.from('contact_tag_mappings')
		.upsert({ contact_id, tag_id }, { onConflict: 'contact_id,tag_id' });

	if (dbErr) throw error(400, dbErr.message);
	return json({ success: true });
};
