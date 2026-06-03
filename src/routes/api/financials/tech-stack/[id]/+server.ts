import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const body = await request.json();

	const update: Record<string, unknown> = {};
	if (body.name !== undefined) update.name = body.name;
	if (body.category !== undefined) update.category = body.category;
	if (body.monthlyCost !== undefined) update.monthly_cost = body.monthlyCost;
	if (body.billingCycle !== undefined) update.billing_cycle = body.billingCycle;
	if (body.url !== undefined) update.url = body.url;
	if (body.notes !== undefined) update.notes = body.notes;
	if (body.active !== undefined) update.active = body.active;
	if (body.projectIds !== undefined) update.project_ids = body.projectIds;
	if (body.campaignIds !== undefined) update.campaign_ids = body.campaignIds;

	const { data, error: e } = await supabaseAdmin
		.from('tech_stack_items')
		.update(update)
		.eq('id', params.id)
		.eq('user_id', user.id)
		.select()
		.single();

	if (e) throw error(500, e.message);
	return json(data);
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	await supabaseAdmin.from('tech_stack_items').delete().eq('id', params.id).eq('user_id', user.id);
	return json({ ok: true });
};
