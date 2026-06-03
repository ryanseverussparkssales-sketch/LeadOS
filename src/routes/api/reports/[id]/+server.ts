import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const { data } = await supabaseAdmin
		.from('generated_reports')
		.select('*')
		.eq('id', params.id)
		.eq('user_id', user.id)
		.single();
	if (!data) throw error(404, 'Report not found');
	return json(data);
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	await supabaseAdmin.from('generated_reports').delete().eq('id', params.id).eq('user_id', user.id);
	return json({ success: true });
};
