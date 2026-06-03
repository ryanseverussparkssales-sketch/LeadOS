import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	await supabaseAdmin.from('voicemail_drops').delete().eq('id', params.id).eq('user_id', ownerId);
	return json({ success: true });
};
