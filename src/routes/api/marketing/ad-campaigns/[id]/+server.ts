import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const b = await request.json();
	const map: [string,string][] = [
		['name','name'],['status','status'],['platform','platform'],['campaignType','campaign_type'],
		['budget','budget'],['budgetPeriod','budget_period'],['spent','spent'],
		['impressions','impressions'],['clicks','clicks'],['leads','leads'],
		['conversions','conversions'],['ctr','ctr'],['cpc','cpc'],['cpl','cpl'],['roas','roas'],
		['startDate','start_date'],['endDate','end_date'],['notes','notes'],
	];
	const update: Record<string,unknown> = { updated_at: new Date().toISOString() };
	for (const [js,db] of map) if (b[js] !== undefined) update[db] = b[js];

	// Auto-calc metrics
	if (update.impressions && update.clicks) {
		update.ctr = (update.clicks as number) / (update.impressions as number);
	}
	if (update.spent && update.clicks && (update.clicks as number) > 0) {
		update.cpc = (update.spent as number) / (update.clicks as number);
	}
	if (update.spent && update.leads && (update.leads as number) > 0) {
		update.cpl = (update.spent as number) / (update.leads as number);
	}

	const { data, error: e } = await supabaseAdmin.from('ad_campaigns_ext').update(update)
		.eq('id', params.id).eq('user_id', user.id).select().single();
	if (e) throw error(500, e.message);
	return json(data);
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	await supabaseAdmin.from('ad_campaigns_ext').delete().eq('id', params.id).eq('user_id', user.id);
	return json({ ok: true });
};
