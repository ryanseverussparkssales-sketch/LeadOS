import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const { error: e } = await supabaseAdmin
		.from('api_tokens').delete().eq('id', params.id).eq('user_id', user.id);
	if (e) throw error(400, e.message);
	return json({ success: true });
};
