import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	const contactId = url.searchParams.get('contact_id');
	const outcome   = url.searchParams.get('outcome');
	const date      = url.searchParams.get('date');
	// True pagination: limit (capped) + offset. Response stays an array; the total
	// (for this tenant + filters) is returned in the X-Total-Count header so callers
	// can page without a breaking shape change.
	const limit  = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '50'), 1), 200);
	const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0'), 0);

	let query = supabaseAdmin
		.from('calls')
		.select('*, contact:contacts(id, name, phone, company, title)', { count: 'exact' })
		.eq('user_id', ownerId)
		.order('created_at', { ascending: false })
		.range(offset, offset + limit - 1);

	if (contactId) query = query.eq('contact_id', contactId);
	if (outcome)   query = query.eq('outcome', outcome);
	if (date)      query = query.gte('created_at', `${date}T00:00:00`).lte('created_at', `${date}T23:59:59`);

	const { data, error, count } = await query;
	if (error) {
		console.error('[calls GET]', error.message);
		return json([]);
	}
	return json(data ?? [], { headers: { 'X-Total-Count': String(count ?? 0) } });
};
