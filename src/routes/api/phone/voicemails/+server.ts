import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const status = url.searchParams.get('status');
	let q = supabaseAdmin
		.from('voicemails').select('*, phone_number:phone_numbers(phone_number, friendly_name)')
		.eq('user_id', user.id).order('received_at', { ascending: false }).limit(100);
	if (status) q = q.eq('status', status);
	const { data } = await q;
	return json(data ?? []);
};
