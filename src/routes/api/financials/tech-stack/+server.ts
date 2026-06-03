import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { data } = await supabaseAdmin
		.from('tech_stack_items')
		.select('*')
		.eq('user_id', user.id)
		.order('category')
		.order('name');
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const body = await request.json();

	const { data, error: e } = await supabaseAdmin
		.from('tech_stack_items')
		.insert({
			user_id: user.id,
			name: body.name,
			category: body.category ?? 'other',
			monthly_cost: body.monthlyCost ?? 0,
			billing_cycle: body.billingCycle ?? 'monthly',
			url: body.url ?? null,
			notes: body.notes ?? null,
			project_ids: body.projectIds ?? [],
			campaign_ids: body.campaignIds ?? [],
			active: body.active ?? true,
		})
		.select()
		.single();

	if (e) throw error(500, e.message);
	return json(data, { status: 201 });
};
