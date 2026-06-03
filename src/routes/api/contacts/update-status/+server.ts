import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { contact_id, status } = await request.json();
	if (!contact_id || !status) throw error(400, 'contact_id and status required');

	const valid = ['active', 'do_not_call', 'archived'];
	if (!valid.includes(status)) throw error(400, 'Invalid status');

	const { error: dbErr } = await supabaseAdmin
		.from('contacts')
		.update({ status })
		.eq('id', contact_id)
		.eq('user_id', user.id);

	if (dbErr) throw error(400, dbErr.message);
	return json({ success: true });
};
