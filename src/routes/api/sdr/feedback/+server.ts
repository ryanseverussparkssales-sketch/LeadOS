// SDR reads their own call feedback from manager
import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20'), 100);

	// Get calls made by this SDR
	const { data: calls } = await supabaseAdmin
		.from('calls')
		.select('id')
		.eq('user_id', user.id)
		.order('created_at', { ascending: false })
		.limit(200);

	const callIds = (calls ?? []).map(c => c.id);
	if (!callIds.length) return json([]);

	const { data } = await supabaseAdmin
		.from('call_feedback')
		.select('*, call:calls(id, contact:contacts(name, company), created_at, recording_url, outcome)')
		.in('call_id', callIds)
		.order('created_at', { ascending: false })
		.limit(limit);

	return json(data ?? []);
};
