import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// GET: list balance entries (last 52 weeks by default)
export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const weeks = parseInt(url.searchParams.get('weeks') ?? '52');

	const since = new Date();
	since.setDate(since.getDate() - weeks * 7);

	const { data } = await supabaseAdmin
		.from('balance_entries')
		.select('*')
		.eq('user_id', user.id)
		.gte('entry_date', since.toISOString().slice(0, 10))
		.order('entry_date', { ascending: true });

	return json(data ?? []);
};

// POST: upsert a balance entry for a given date
export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { entryDate, income, expenses, notes } = await request.json();

	if (!entryDate) throw error(400, 'entryDate required');

	const { data, error: e } = await supabaseAdmin
		.from('balance_entries')
		.upsert(
			{
				user_id: user.id,
				entry_date: entryDate,
				income: income ?? 0,
				expenses: expenses ?? 0,
				notes: notes ?? null,
			},
			{ onConflict: 'user_id,entry_date' }
		)
		.select()
		.single();

	if (e) throw error(500, e.message);
	return json(data);
};
