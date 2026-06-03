import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);

	const { error: dbErr } = await supabaseAdmin
		.from('contact_filters')
		.delete()
		.eq('id', params.id)
		.eq('user_id', user.id);

	if (dbErr) throw error(400, dbErr.message);
	return json({ success: true });
};
