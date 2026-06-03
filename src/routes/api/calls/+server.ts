import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	const contactId = url.searchParams.get('contact_id');
	const outcome   = url.searchParams.get('outcome');
	const date      = url.searchParams.get('date');
	const limit     = parseInt(url.searchParams.get('limit') ?? '50');

	let query = supabaseAdmin
		.from('calls')
		.select('*, contact:contacts(id, name, phone, company, title)')
		.eq('user_id', ownerId)
		.order('created_at', { ascending: false })
		.limit(limit);

	if (contactId) query = query.eq('contact_id', contactId);
	if (outcome)   query = query.eq('outcome', outcome);
	if (date)      query = query.gte('created_at', `${date}T00:00:00`).lte('created_at', `${date}T23:59:59`);

	const { data, error } = await query;
	if (error) {
		console.error('[calls GET]', error.message);
		return json([]);
	}
	return json(data ?? []);
};
