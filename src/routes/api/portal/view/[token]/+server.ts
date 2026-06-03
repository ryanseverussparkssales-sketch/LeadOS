import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const { data } = await supabaseAdmin
		.from('generated_reports')
		.select('report_title, html_content, created_at, report_type, share_expires_at')
		.eq('share_token', params.token)
		.single();

	if (!data) return json({ error: 'Not found' }, { status: 404 });
	if (data.share_expires_at && new Date(data.share_expires_at) < new Date()) {
		return json({ error: 'Link expired' }, { status: 410 });
	}
	return json(data);
};
