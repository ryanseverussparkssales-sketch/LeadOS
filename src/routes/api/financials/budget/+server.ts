import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { data } = await supabaseAdmin
		.from('budget_entries')
		.select('*')
		.eq('user_id', user.id)
		.order('entry_type')
		.order('category')
		.order('label');
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const body = await request.json();

	const { data, error: e } = await supabaseAdmin
		.from('budget_entries')
		.insert({
			user_id: user.id,
			entry_type: body.entryType,   // income | expense
			category: body.category,
			label: body.label,
			amount: body.amount,
			frequency: body.frequency ?? 'monthly',
			entry_date: body.entryDate ?? null,
			notes: body.notes ?? null,
		})
		.select()
		.single();

	if (e) throw error(500, e.message);
	return json(data, { status: 201 });
};
