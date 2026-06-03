import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import { randomBytes } from 'crypto';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { reportId } = await request.json();
	if (!reportId) throw error(400, 'reportId required');

	const { data: report } = await supabaseAdmin.from('generated_reports').select('id').eq('id', reportId).eq('user_id', user.id).single();
	if (!report) throw error(403, 'Report not found');

	const token = randomBytes(32).toString('hex');
	const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString(); // 30 days

	await supabaseAdmin.from('generated_reports').update({ share_token: token, share_expires_at: expiresAt }).eq('id', reportId);

	return json({ token, expiresAt, url: `/portal/${token}` });
};
