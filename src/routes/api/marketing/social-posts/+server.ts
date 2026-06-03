import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const clientId = url.searchParams.get('clientId');
	const status = url.searchParams.get('status');
	let q = supabaseAdmin.from('social_posts')
		.select('*, client:clients(name), asset:marketing_assets(name,file_url,thumbnail_url,platform)')
		.eq('user_id', user.id).order('created_at', { ascending: false });
	if (clientId) q = q.eq('client_id', clientId);
	if (status) q = q.eq('status', status);
	const { data } = await q;
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const b = await request.json();
	const { data, error: e } = await supabaseAdmin.from('social_posts').insert({
		user_id: user.id,
		client_id: b.clientId ?? null,
		platform_account_id: b.platformAccountId ?? null,
		asset_id: b.assetId ?? null,
		caption: b.caption ?? null,
		hashtags: b.hashtags ?? null,
		platforms: b.platforms ?? [],
		status: b.status ?? 'draft',
		scheduled_at: b.scheduledAt ?? null,
		notes: b.notes ?? null,
		ai_generated: b.aiGenerated ?? false,
	}).select().single();
	if (e) throw error(500, e.message);
	return json(data, { status: 201 });
};
