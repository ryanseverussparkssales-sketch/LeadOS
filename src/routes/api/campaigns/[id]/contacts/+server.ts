import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, normalizePhone } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// Helper: get or create the Default call list for a campaign (for dialer access)
async function syncToDefaultList(campaignId: string, contactIds: string[]) {
	if (!contactIds.length) return;

	// Find or create Default call list
	let { data: list } = await supabaseAdmin
		.from('call_lists')
		.select('id')
		.eq('campaign_id', campaignId)
		.eq('name', 'Default')
		.maybeSingle();

	if (!list) {
		const { data: campaign } = await supabaseAdmin
			.from('campaigns')
			.select('id, project_id')
			.eq('id', campaignId)
			.single();
		if (!campaign) return;

		const { data: newList } = await supabaseAdmin
			.from('call_lists')
			.insert({ campaign_id: campaignId, project_id: campaign.project_id, name: 'Default', status: 'active' })
			.select('id')
			.single();
		list = newList;
	}

	if (!list) return;

	// Upsert all contacts into the call list
	const rows = contactIds.map(id => ({ call_list_id: list!.id, contact_id: id, status: 'pending' }));
	await supabaseAdmin.from('call_list_contacts')
		.upsert(rows, { onConflict: 'call_list_id,contact_id', ignoreDuplicates: true });
}

// GET: list contacts in this campaign
export const GET: RequestHandler = async ({ request, params, url }) => {
	await requireAuth(request);
	const limit = parseInt(url.searchParams.get('limit') ?? '200');
	const search = url.searchParams.get('search') ?? '';

	const { data: ccRows, error: e1 } = await supabaseAdmin
		.from('campaign_contacts')
		.select('id, contact_id')
		.eq('campaign_id', params.id)
		.order('id', { ascending: false })
		.limit(limit);

	if (e1) {
		console.error('[campaign contacts GET] step1:', e1.message);
		throw error(500, e1.message);
	}

	if (!ccRows?.length) return json({ contacts: [], list_id: params.id, total: 0 });

	const contactIds = ccRows.map((r: any) => r.contact_id);
	const { data: contactRows, error: e2 } = await supabaseAdmin
		.from('contacts')
		.select('id, name, company, phone, email, status, contact_score, contact_type')
		.in('id', contactIds);

	if (e2) {
		console.error('[campaign contacts GET] step2:', e2.message);
		throw error(500, e2.message);
	}

	const contactMap = new Map((contactRows ?? []).map((c: any) => [c.id, c]));
	let contacts = ccRows.map((r: any) => ({
		...(contactMap.get(r.contact_id) ?? { id: r.contact_id }),
		list_contact_id: r.id,
		list_status: 'pending',
		attempt_count: 0,
		last_called_at: null,
		next_follow_up_at: null,
		cadence_complete: false,
	}));

	if (search) {
		const s = search.toLowerCase();
		contacts = contacts.filter((c: any) =>
			c.name?.toLowerCase().includes(s) ||
			c.company?.toLowerCase().includes(s) ||
			c.phone?.includes(s)
		);
	}

	return json({ contacts, list_id: params.id, total: contacts.length });
};

// POST: add contacts to this campaign
export const POST: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const body = await request.json();
	const { mode, contact, contactIds } = body;

	if (mode === 'manual' && contact) {
		const digits = (contact.phone ?? '').replace(/\D/g, '');
		const phoneNorm =
			digits.length === 10 ? `+1${digits}` :
			digits.length === 11 ? `+${digits}` :
			contact.phone || null;

		const { data: newContact, error: ce } = await supabaseAdmin
			.from('contacts')
			.insert({
				user_id: user.id,
				name: contact.name,
				phone: contact.phone || '',
				phone_normalized: phoneNorm,
				email: contact.email || null,
				company: contact.company || null,
				status: 'active',
			})
			.select('id, name')
			.single();

		if (ce) throw error(400, ce.message);

		await supabaseAdmin.from('campaign_contacts')
			.insert({ campaign_id: params.id, contact_id: newContact.id });
		await syncToDefaultList(params.id, [newContact.id]);

		return json({ added: 1, contact: newContact }, { status: 201 });
	}

	if (mode === 'existing' && contactIds?.length) {
		const rows = (contactIds as string[]).map((id: string) => ({
			campaign_id: params.id,
			contact_id: id,
		}));
	return json({ success: true });
};
