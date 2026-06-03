import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const clientId = url.searchParams.get('clientId');
	let q = supabaseAdmin.from('social_platform_accounts')
		.select('*, client:clients(name)').eq('user_id', user.id).order('platform');
	if (clientId === 'own') q = q.is('client_id', null);
	else if (clientId) q = q.eq('client_id', clientId);
	const { data } = await q;
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const b = await request.json();
	const { data, error: e } = await supabaseAdmin.from('social_platform_accounts').upsert({
		user_id: user.id,
		client_id: b.clientId ?? null,
		platform: b.platform,
		account_name: b.accountName ?? null,
		account_handle: b.accountHandle ?? null,
		account_url: b.accountUrl ?? null,
		followers: b.followers ?? 0,
		status: b.status ?? 'connected',
		notes: b.notes ?? null,
	}, { onConflict: 'user_id,client_id,platform' }).select().single();
	if (e) throw error(500, e.message);
	return json(data, { status: 201 });
};
