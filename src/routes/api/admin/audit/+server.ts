import { json } from '@sveltejs/kit';
import { requireSuperAdmin, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// GET /api/admin/audit?limit=&action=&target= — the admin action trail.
export const GET: RequestHandler = async ({ request, url }) => {
	await requireSuperAdmin(request);
	const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '100'), 1), 500);
	const action = url.searchParams.get('action');
	const target = url.searchParams.get('target');

	let q = supabaseAdmin
		.from('admin_audit_log')
		.select('*')
		.order('created_at', { ascending: false })
		.limit(limit);
	if (action) q = q.eq('action', action);
	if (target) q = q.eq('target_user_id', target);

	const { data } = await q;
	return json({ entries: data ?? [] });
};
