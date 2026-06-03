import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const year = parseInt(url.searchParams.get('year') ?? String(new Date().getFullYear()));

	const { data: deals } = await supabaseAdmin
		.from('deals')
		.select('value, won_at, stage, client_id, contact:contacts(name, company), client:clients(name)')
		.eq('user_id', ownerId)
		.eq('stage', 'won')
		.is('deleted_at', null)
		.gte('won_at', `${year}-01-01`)
		.lte('won_at', `${year}-12-31`);

	const all = deals ?? [];
	const totalRevenue = all.reduce((s, d) => s + (d.value ?? 0), 0);
	const dealCount = all.length;
	const avgDealSize = dealCount ? totalRevenue / dealCount : 0;

	// Monthly revenue
	const monthly = Array.from({ length: 12 }, (_, i) => ({
		month: i + 1,
		label: new Date(year, i).toLocaleString('default', { month: 'short' }),
		revenue: 0,
		deals: 0,
	}));
	for (const d of all) {
		const month = new Date(d.won_at!).getMonth();
		monthly[month].revenue += d.value ?? 0;
		monthly[month].deals++;
	}

	// Top deals
	const topDeals = [...all].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 10);

	// Available years
	const { data: yearRange } = await supabaseAdmin.from('deals').select('won_at').eq('user_id', ownerId).eq('stage', 'won').not('won_at', 'is', null).order('won_at').limit(1);
	const minYear = yearRange?.[0]?.won_at ? new Date(yearRange[0].won_at).getFullYear() : year;

	return json({ year, totalRevenue, dealCount, avgDealSize, monthly, topDeals, minYear });
};
