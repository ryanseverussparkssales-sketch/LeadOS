import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const campaignId = url.searchParams.get('campaign_id');
	let q = supabaseAdmin.from('campaign_goals').select('*, campaign:campaigns(id,name)').eq('user_id', user.id);
	if (campaignId) q = q.eq('campaign_id', campaignId);
	const { data } = await q.order('campaign_id');
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { campaignId, goalType, targetValue, period } = await request.json();
	if (!campaignId || !goalType || !targetValue) throw error(400, 'campaignId, goalType, targetValue required');
	const { data, error: e } = await supabaseAdmin
		.from('campaign_goals')
		.upsert({ user_id: user.id, campaign_id: campaignId, goal_type: goalType, target_value: targetValue, period: period ?? 'daily' }, { onConflict: 'campaign_id,goal_type,period' })
		.select('*, campaign:campaigns(name)').single();
	if (e) throw error(400, e.message);
	return json(data);
};
