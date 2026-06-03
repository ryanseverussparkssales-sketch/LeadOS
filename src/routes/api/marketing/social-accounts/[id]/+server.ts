import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const b = await request.json();
	const map: [string,string][] = [
		['accountName','account_name'],['accountHandle','account_handle'],['accountUrl','account_url'],
		['followers','followers'],['following','following'],['status','status'],['notes','notes'],
	];
	const update: Record<string,unknown> = { last_synced_at: new Date().toISOString() };
	for (const [js,db] of map) if (b[js] !== undefined) update[db] = b[js];
	const { data, error: e } = await supabaseAdmin.from('social_platform_accounts').update(update)
		.eq('id', params.id).eq('user_id', user.id).select().single();
	if (e) throw error(500, e.message);
	return json(data);
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	await supabaseAdmin.from('social_platform_accounts').delete().eq('id', params.id).eq('user_id', user.id);
	return json({ ok: true });
};
