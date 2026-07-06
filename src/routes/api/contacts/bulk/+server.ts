import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// POST /api/contacts/bulk — Workstream 2F bulk actions on the contacts list.
// Body: { ids: string[], action, payload?: { tagId?, campaignId?, callListId? } }
// Returns: { requested, processed, skipped }
// Tenancy: ids are validated against the owner BEFORE any mutation; unowned or
// deleted ids are silently skipped (reported in `skipped`), never mutated.

const MAX_IDS = 1000;
const CHUNK = 500;

const ACTIONS = ['add_tag', 'assign_campaign', 'add_to_call_list', 'mark_dnc', 'soft_delete'] as const;
type BulkAction = (typeof ACTIONS)[number];

interface BulkBody {
	ids: string[];
	action: BulkAction;
	payload?: { tagId?: string; campaignId?: string; callListId?: string };
}

function chunks<T>(arr: T[], size = CHUNK): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
	return out;
}

async function verifyCampaignOwner(campaignId: string, ownerId: string) {
	const { data: campaign } = await supabaseAdmin
		.from('campaigns')
		.select('id, project_id, project:projects(id, client:clients(user_id))')
		.eq('id', campaignId)
		.maybeSingle();
	if (!campaign) throw error(404, 'Campaign not found');
	const owner = (campaign.project as unknown as { client: { user_id: string } })?.client?.user_id;
	if (owner !== ownerId) throw error(403, 'Forbidden');
	return campaign as unknown as { id: string; project_id: string };
}

async function verifyCallListOwner(listId: string, ownerId: string) {
	const { data: list } = await supabaseAdmin
		.from('call_lists')
		.select('id, user_id, campaign:campaigns(id, project:projects(id, client:clients(user_id))), project:projects(id, client:clients(user_id))')
		.eq('id', listId)
		.maybeSingle();
	if (!list) throw error(404, 'Call list not found');
	type OwnerJoin = { project?: { client?: { user_id?: string } }; client?: { user_id?: string } };
	const viaCampaign = (list.campaign as unknown as OwnerJoin)?.project?.client?.user_id;
	const viaProject = (list.project as unknown as OwnerJoin)?.client?.user_id;
	if (list.user_id !== ownerId && viaCampaign !== ownerId && viaProject !== ownerId) {
		throw error(403, 'Forbidden');
	}
}

// Mirrors syncToDefaultList in /api/campaigns/[id]/contacts so the dialer's
// Default call list stays in sync when contacts are bulk-assigned to a campaign.
async function syncToDefaultList(campaignId: string, projectId: string, contactIds: string[]) {
	if (!contactIds.length) return;

	let { data: list } = await supabaseAdmin
		.from('call_lists')
		.select('id')
		.eq('campaign_id', campaignId)
		.eq('name', 'Default')
		.maybeSingle();

	if (!list) {
		const { data: newList } = await supabaseAdmin
			.from('call_lists')
			.insert({ campaign_id: campaignId, project_id: projectId, name: 'Default', status: 'active' })
			.select('id')
			.single();
		list = newList;
	}
	if (!list) return;

	for (const part of chunks(contactIds)) {
		const rows = part.map((contact_id) => ({ call_list_id: list!.id, contact_id, status: 'pending' }));
		await supabaseAdmin
			.from('call_list_contacts')
			.upsert(rows, { onConflict: 'call_list_id,contact_id', ignoreDuplicates: true });
	}
}

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	let body: BulkBody;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const { ids, action, payload } = body ?? {};
	if (!Array.isArray(ids) || ids.length === 0) throw error(400, 'ids array required');
	if (ids.length > MAX_IDS) throw error(400, `Too many ids — max ${MAX_IDS} per request`);
	if (!ACTIONS.includes(action)) throw error(400, `action must be one of: ${ACTIONS.join(', ')}`);

	const uniqueIds = [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))];
	const requested = uniqueIds.length;
	if (!requested) throw error(400, 'ids array required');

	// Tenancy gate: resolve the owned, non-deleted subset before ANY mutation.
	// (The IN() list is chunked at 500 per statement to stay within URL limits —
	// same convention as /api/contacts/bulk-dnc.)
	const ownedIds: string[] = [];
	for (const part of chunks(uniqueIds)) {
		const { data, error: e } = await supabaseAdmin
			.from('contacts')
			.select('id')
			.in('id', part)
			.eq('user_id', ownerId)
			.is('deleted_at', null);
		if (e) throw error(500, e.message);
		for (const row of data ?? []) ownedIds.push(row.id);
	}

	const skipped = requested - ownedIds.length;
	if (!ownedIds.length) return json({ requested, processed: 0, skipped });

	if (action === 'add_tag') {
		const tagId = payload?.tagId;
		if (!tagId) throw error(400, 'payload.tagId required');

		// Verify the tag belongs to the owner before mapping anything to it
		const { data: tag } = await supabaseAdmin
			.from('contact_tags')
			.select('id')
			.eq('id', tagId)
			.eq('user_id', ownerId)
			.maybeSingle();
		if (!tag) throw error(404, 'Tag not found');

		for (const part of chunks(ownedIds)) {
			const rows = part.map((contact_id) => ({ contact_id, tag_id: tagId }));
			// UNIQUE (contact_id, tag_id) in 0000_baseline.sql — skip existing pairs
			const { error: e } = await supabaseAdmin
				.from('contact_tag_mappings')
				.upsert(rows, { onConflict: 'contact_id,tag_id', ignoreDuplicates: true });
			if (e) throw error(500, e.message);
		}
	} else if (action === 'assign_campaign') {
		const campaignId = payload?.campaignId;
		if (!campaignId) throw error(400, 'payload.campaignId required');
		const campaign = await verifyCampaignOwner(campaignId, ownerId);

		// Same linkage as /api/campaigns/[id]/contacts POST (mode 'existing'):
		// upsert campaign_contacts, then sync into the campaign's Default call list
		for (const part of chunks(ownedIds)) {
			const rows = part.map((contact_id) => ({ campaign_id: campaignId, contact_id }));
			const { error: e } = await supabaseAdmin
				.from('campaign_contacts')
				.upsert(rows, { onConflict: 'campaign_id,contact_id' });
			if (e) throw error(500, e.message);
		}
		await syncToDefaultList(campaignId, campaign.project_id, ownedIds);
	} else if (action === 'add_to_call_list') {
		const callListId = payload?.callListId;
		if (!callListId) throw error(400, 'payload.callListId required');
		await verifyCallListOwner(callListId, ownerId);

		for (const part of chunks(ownedIds)) {
			const rows = part.map((contact_id) => ({ call_list_id: callListId, contact_id, status: 'pending' }));
			// UNIQUE (call_list_id, contact_id) — skip contacts already on the list
			const { error: e } = await supabaseAdmin
				.from('call_list_contacts')
				.upsert(rows, { onConflict: 'call_list_id,contact_id', ignoreDuplicates: true });
			if (e) throw error(500, e.message);
		}
	} else if (action === 'mark_dnc') {
		for (const part of chunks(ownedIds)) {
			const { error: e } = await supabaseAdmin
				.from('contacts')
				.update({ status: 'do_not_call' })
				.in('id', part)
				.eq('user_id', ownerId);
			if (e) throw error(500, e.message);
		}
	} else {
		// soft_delete
		const now = new Date().toISOString();
		for (const part of chunks(ownedIds)) {
			const { error: e } = await supabaseAdmin
				.from('contacts')
				.update({ deleted_at: now })
				.in('id', part)
				.eq('user_id', ownerId);
			if (e) throw error(500, e.message);
		}
	}

	return json({ requested, processed: ownedIds.length, skipped });
};
