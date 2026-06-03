import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const clientId = url.searchParams.get('client_id');
	const sdrUserId = url.searchParams.get('sdr_user_id');

	let q = supabaseAdmin
		.from('engagements')
		.select('*, client:clients(id, name)')
		.eq('owner_user_id', ownerId)
		.order('created_at', { ascending: false });

	if (clientId) q = q.eq('client_id', clientId);
	if (sdrUserId) q = q.eq('sdr_user_id', sdrUserId);

	const { data } = await q;
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { clientId, sdrUserId, baseFee, bonusRate, billingDay, notes } = await request.json();

	if (!clientId) throw error(400, 'clientId required');

	const { data, error: e } = await supabaseAdmin
		.from('engagements')
		.upsert({
			owner_user_id: ownerId,
			client_id: clientId,
			sdr_user_id: sdrUserId ?? null,
			base_fee: baseFee ?? 0,
			bonus_rate: bonusRate ?? 50,
			billing_day: billingDay ?? 1,
			notes: notes ?? null,
			active: true,
		}, { onConflict: 'owner_user_id,client_id,sdr_user_id' })
		.select('*, client:clients(id, name)')
		.single();

	if (e) throw error(400, e.message);
	return json(data);
};

export const DELETE: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const id = url.searchParams.get('id');
	if (!id) throw error(400, 'id required');

	await supabaseAdmin.from('engagements').delete()
		.eq('id', id).eq('owner_user_id', ownerId);
	return json({ ok: true });
};
