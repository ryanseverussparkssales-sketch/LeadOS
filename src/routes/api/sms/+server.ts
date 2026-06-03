import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const contactId = url.searchParams.get('contact_id');
	let q = supabaseAdmin.from('sms_logs').select('*, contact:contacts(name, company)').eq('user_id', ownerId).order('sent_at', { ascending: false }).limit(100);
	if (contactId) q = q.eq('contact_id', contactId);
	const { data, error } = await q;
	if (error) {
		console.error('[sms GET]', error.message);
		return json([]);
	}
	return json(data ?? []);
};
