import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const body = await request.json();

	const update: Record<string, unknown> = {};
	if (body.entryType !== undefined) update.entry_type = body.entryType;
	if (body.category !== undefined) update.category = body.category;
	if (body.label !== undefined) update.label = body.label;
	if (body.amount !== undefined) update.amount = body.amount;
	if (body.frequency !== undefined) update.frequency = body.frequency;
	if (body.notes !== undefined) update.notes = body.notes;

	const { data, error: e } = await supabaseAdmin
		.from('budget_entries')
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
	await supabaseAdmin.from('budget_entries').delete().eq('id', params.id).eq('user_id', user.id);
	return json({ ok: true });
};
