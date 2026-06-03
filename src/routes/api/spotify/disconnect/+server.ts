import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	await supabaseAdmin.from('user_preferences').update({ spotify_tokens: null }).eq('user_id', user.id);
	return json({ ok: true });
};
