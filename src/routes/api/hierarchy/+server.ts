import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);

	const { data: clients } = await supabaseAdmin
		.from('clients')
		.select('*, projects(*, call_lists(*))')
		.eq('user_id', user.id)
		.order('created_at');

	return json(clients ?? []);
};
