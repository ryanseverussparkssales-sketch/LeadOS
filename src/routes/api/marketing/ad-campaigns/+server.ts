import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const clientId = url.searchParams.get('clientId');
	const platform = url.searchParams.get('platform');
	let q = supabaseAdmin.from('ad_campaigns_ext')
		.select('*, client:clients(name)').eq('user_id', user.id).order('created_at', { ascending: false });
	if (clientId) q = q.eq('client_id', clientId);
	if (platform) q = q.eq('platform', platform);
	const { data } = await q;
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const b = await request.json();
	const { data, error: e } = await supabaseAdmin.from('ad_campaigns_ext').insert({
		user_id: user.id,
		client_id: b.clientId ?? null,
		lead_campaign_id: b.leadCampaignId ?? null,
		name: b.name,
		platform: b.platform,
		campaign_type: b.campaignType ?? 'awareness',
		status: b.status ?? 'active',
		budget: b.budget ?? null,
		budget_period: b.budgetPeriod ?? 'monthly',
		spent: b.spent ?? 0,
		impressions: b.impressions ?? 0,
		clicks: b.clicks ?? 0,
		leads: b.leads ?? 0,
		conversions: b.conversions ?? 0,
		start_date: b.startDate ?? null,
		end_date: b.endDate ?? null,
		ad_account_id: b.adAccountId ?? null,
		external_campaign_id: b.externalCampaignId ?? null,
		notes: b.notes ?? null,
	}).select().single();
	if (e) throw error(500, e.message);
	return json(data, { status: 201 });
};
