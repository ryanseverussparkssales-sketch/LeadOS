import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	// Voicemail drops are Pro+ only
	const { getUserTier } = await import('$lib/server/tier');
	const tier = await getUserTier(ownerId);
	if (tier === 'free') return json([]); // free tier: no voicemail drops

	const { data } = await supabaseAdmin.from('voicemail_drops').select('*').eq('user_id', ownerId).order('is_default', { ascending: false }).order('created_at');
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { title, audioUrl, durationSeconds, isDefault } = await request.json();
	if (!title?.trim()) throw error(400, 'title required');
	if (isDefault) await supabaseAdmin.from('voicemail_drops').update({ is_default: false }).eq('user_id', ownerId);
	return json({ success: true });
};
