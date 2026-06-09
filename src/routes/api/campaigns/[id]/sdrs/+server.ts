import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// Confirm the campaign belongs to the caller's tenant before any read/write.
// Without this, any authenticated user could list/insert/delete SDR assignments
// on ANY campaign (cross-tenant team-member email leak + assignment tampering).
async function verifyCampaignOwner(campaignId: string, ownerId: string) {
	const { data } = await supabaseAdmin
		.from('campaigns')
		.select('id, project:projects(client:clients(user_id))')
		.eq('id', campaignId)
		.single();
	const owner = (data?.project as unknown as { client: { user_id: string } })?.client?.user_id;
	if (!data || owner !== ownerId) throw error(403, 'Forbidden');
}

// GET: list SDRs assigned to this campaign
export const GET: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	await verifyCampaignOwner(params.id, ownerId);

	const { data } = await supabaseAdmin
		.from('campaign_sdrs')
		.select('id, sdr_id, team_member:team_members(id, member_email, role, member_user_id)')
		.eq('campaign_id', params.id);

	return json(data ?? []);
};

// POST: assign an SDR to this campaign
// Body: { teamMemberId }
export const POST: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	await verifyCampaignOwner(params.id, ownerId);
	const { teamMemberId } = await request.json();
	if (!teamMemberId) throw error(400, 'teamMemberId required');

	const { data, error: e } = await supabaseAdmin
		.from('campaign_sdrs')
		.insert({ campaign_id: params.id, sdr_id: teamMemberId, owner_user_id: ownerId })
		.select('id, sdr_id, team_member:team_members(id, member_email, role)')
		.single();

	if (e) throw error(400, e.message);
	return json(data);
};

// DELETE: remove SDR from campaign — ?sdr_id=uuid
export const DELETE: RequestHandler = async ({ request, params, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	await verifyCampaignOwner(params.id, ownerId);
	const sdrId = url.searchParams.get('sdr_id');
	if (!sdrId) throw error(400, 'sdr_id required');

	await supabaseAdmin.from('campaign_sdrs').delete()
		.eq('campaign_id', params.id).eq('sdr_id', sdrId);

	return json({ ok: true });
};
