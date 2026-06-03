import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import { incrementQuota } from '$lib/server/quotas';
import { deliverWebhooks } from '$lib/server/webhooks';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const body = await request.json();

	if (body.restore === true) {
		const { data, error: e } = await supabaseAdmin
			.from('deals')
			.update({ deleted_at: null })
			.eq('id', params.id)
			.eq('user_id', ownerId)
			.select('*, contact:contacts(id,name,company), client:clients(id,name)')
			.single();
		if (e) throw error(400, e.message);
		return json(data);
	}

	if (body.stage === 'won' && !body.won_at) body.won_at = new Date().toISOString();
	if (body.stage === 'lost' && !body.lost_at) body.lost_at = new Date().toISOString();
	body.updated_at = new Date().toISOString();

	const { data, error: e } = await supabaseAdmin
		.from('deals')
		.update(body)
		.eq('id', params.id)
		.eq('user_id', ownerId)
		.select('*, contact:contacts(id,name,company), client:clients(id,name)')
		.single();
	if (e) throw error(400, e.message);

	// Increment revenue quota when a deal is won
	if (body.stage === 'won' && data?.value) {
		incrementQuota(user.id, 'revenue', Number(data.value)).catch(console.error);
	}

	// Fire deal_won webhook (fire-and-forget)
	if (body.stage === 'won') {
		deliverWebhooks(user.id, 'deal_won', {
			dealId: params.id, value: data?.value, stage: 'won',
			contactId: data?.contact_id,
		}).catch(console.error);
	}

	return json(data);
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	const { error: e } = await supabaseAdmin
		.from('deals')
		.update({ deleted_at: new Date().toISOString() })
		.eq('id', params.id)
		.eq('user_id', ownerId);
	if (e) throw error(400, e.message);
	return json({ success: true });
};
