import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const campaignId = url.searchParams.get('campaign_id');

	let query = supabaseAdmin
		.from('call_lists')
		.select('*, campaign:campaigns(id, name, project:projects(id, name, client:clients(id, name, user_id))), project:projects(id, name, client:clients(id, name, user_id)), call_list_contacts(count)')
		.is('deleted_at', null)
		.order('name');

	if (campaignId) query = query.eq('campaign_id', campaignId);

	const { data, error: qErr } = await query;
	if (qErr) console.error('[call-lists GET] query error:', qErr);

	type OwnerJoin = { project?: { client?: { user_id?: string } }, client?: { user_id?: string } };
	const filtered = (data ?? []).filter(l => {
		const viaCampaign = (l.campaign as unknown as OwnerJoin)?.project?.client?.user_id;
		const viaProject = (l.project as unknown as OwnerJoin)?.client?.user_id;
		return l.user_id === user.id || viaCampaign === user.id || viaProject === user.id;
	}).map(l => {
		// Back-fill campaign.project from the direct project join for legacy lists with no campaign
		if (!l.campaign && l.project) return { ...l, campaign: { id: null, name: null, project: l.project } };
		return l;
	});
	return json(filtered);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { name, campaign_id, project_id: directProjectId } = await request.json();
	if (!name?.trim()) throw error(400, 'name required');
	if (!campaign_id && !directProjectId) throw error(400, 'campaign_id or project_id required');

	if (campaign_id) {
		// Look up campaign to get project_id (needed for NOT NULL constraint)
		const { data: campaign } = await supabaseAdmin
			.from('campaigns')
			.select('id, project_id, project:projects(id, client:clients(user_id))')
			.eq('id', campaign_id)
			.single();

		if (!campaign) throw error(404, 'Campaign not found');
		const owner = (campaign.project as unknown as { client: { user_id: string } })?.client?.user_id;
		if (owner !== user.id) throw error(403, 'Forbidden');

		const { data, error: e } = await supabaseAdmin
			.from('call_lists')
			.insert({
				campaign_id,
				project_id: campaign.project_id,
				name: name.trim(),
				status: 'active',
				user_id: user.id,
			})
			.select()
			.single();
		if (e) throw error(400, e.message);
		return json(data);
	}

	// Legacy: project_id only
	const { data: project } = await supabaseAdmin
		.from('projects')
		.select('id, client:clients(user_id)')
		.eq('id', directProjectId)
		.single();
	if (!project || (project.client as unknown as { user_id: string })?.user_id !== user.id)
		throw error(403, 'Forbidden');

	const { data, error: e } = await supabaseAdmin
		.from('call_lists')
		.insert({ project_id: directProjectId, name: name.trim(), status: 'active', user_id: user.id })
		.select()
		.single();
	if (e) throw error(400, e.message);
	return json(data);
};
