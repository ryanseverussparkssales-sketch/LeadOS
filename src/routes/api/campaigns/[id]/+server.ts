import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

async function verifyCampaignOwner(campaignId: string, userId: string) {
	const { data } = await supabaseAdmin
		.from('campaigns')
		.select('id, project:projects(client:clients(user_id))')
		.eq('id', campaignId)
		.single();
	const owner = (data?.project as unknown as { client: { user_id: string } })?.client?.user_id;
	if (!data || owner !== userId) throw error(403, 'Forbidden');
	return data;
}

export const GET: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	await verifyCampaignOwner(params.id, user.id);
	const { data } = await supabaseAdmin
		.from('campaigns')
		.select('*, from_email_account_id, from_phone_number_id, win_outcome, win_label, win_count, target_wins, custom_outcomes, win_conditions, project:projects(id, name, client:clients(id, name)), call_lists(*, call_list_contacts(count))')
		.eq('id', params.id)
		.single();
	return json(data);
};

export const PATCH: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	await verifyCampaignOwner(params.id, user.id);
	const body = await request.json();

	if (body.restore === true) {
		const { data, error: e } = await supabaseAdmin
			.from('campaigns')
			.update({ deleted_at: null })
			.eq('id', params.id)
			.select()
			.single();
		if (e) throw error(400, e.message);
		return json(data);
	}

	// Whitelist allowed fields to avoid unknown-column errors
	const allowed: Record<string, unknown> = {};
	const fields = [
		'name','status','campaign_type','description','goal',
		'win_outcome','win_label','win_conditions','target_wins','custom_outcomes',
		'daily_call_goal','calls_per_lead','cadence_days',
		'email_sequence_id','from_email_account_id','from_phone_number_id',
		'target_contacts',
	];
	for (const f of fields) {
		if (f in body) allowed[f] = body[f];
	}
	console.log('[campaign PATCH] updating fields:', Object.keys(allowed));
	const { data, error: e } = await supabaseAdmin
		.from('campaigns').update(allowed).eq('id', params.id).select('*, project:projects(id, name, client_id, client:clients(id, name))').single();
	if (e) {
		console.error('[campaign PATCH] error:', e.message);
		throw error(400, e.message);
	}

	return json(data);
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	await verifyCampaignOwner(params.id, user.id);
	const { error: e } = await supabaseAdmin
		.from('campaigns')
		.update({ deleted_at: new Date().toISOString() })
		.eq('id', params.id)
		.eq('status', 'draft'); // only draft campaigns can be deleted

	if (e) throw error(400, e.message);
	return json({ success: true });
};
