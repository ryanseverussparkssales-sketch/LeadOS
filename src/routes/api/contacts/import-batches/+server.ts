import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { data } = await supabaseAdmin
		.from('import_batches')
		.select('*, contact_count:contacts(count)')
		.eq('user_id', ownerId)
		.order('created_at', { ascending: false })
		.limit(50);
	return json(data ?? []);
};
