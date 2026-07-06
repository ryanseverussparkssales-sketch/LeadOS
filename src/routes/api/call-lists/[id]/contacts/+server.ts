import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

async function verifyListOwner(listId: string, userId: string) {
	const ownerId = await getEffectiveUserId(userId);
	const { data } = await supabaseAdmin
		.from('call_lists')
		.select('id, project:projects(client:clients(user_id))')
		.eq('id', listId).single();
	const owner = (data?.project as unknown as { client: { user_id: string } })?.client?.user_id;
	if (!data || owner !== ownerId) throw error(403, 'Forbidden');
	return ownerId;
}

export const GET: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	await verifyListOwner(params.id, user.id);

	const { data } = await supabaseAdmin
		.from('call_list_contacts')
		.select('*, contact:contacts(*, tags:contact_tag_mappings(tag:contact_tags(*)))')
		.eq('call_list_id', params.id)
		.order('queue_position', { ascending: true, nullsFirst: false });

	const contacts = (data ?? []).map(row => ({
		...row.contact,
		list_status: row.status,
		queue_position: row.queue_position,
		tags: (row.contact as Record<string, unknown> & { tags: Array<{tag: Record<string, unknown>}> })?.tags?.map(t => t.tag).filter(Boolean) ?? []
	}));

	return json(contacts);
};

// POST: add one or many contacts to this call list
export const POST: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await verifyListOwner(params.id, user.id);

	const { contact_ids } = await request.json();
	if (!contact_ids?.length) throw error(400, 'contact_ids required');

	// Verify contacts belong to the effective owner (agency tenant)
	const { data: contacts } = await supabaseAdmin
		.from('contacts').select('id').in('id', contact_ids).eq('user_id', ownerId);
	const validIds = contacts?.map(c => c.id) ?? [];

	const rows = validIds.map((contact_id, i) => ({
		call_list_id: params.id,
		contact_id,
		status: 'pending',
		queue_position: i,
	}));

	const { error: e } = await supabaseAdmin
		.from('call_list_contacts')
		.upsert(rows, { onConflict: 'call_list_id,contact_id' });

	if (e) throw error(400, e.message);
	return json({ added: validIds.length });
};

// DELETE: remove a contact from this call list (contact_id in body)
export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	await verifyListOwner(params.id, user.id);
	const { contact_id } = await request.json();
	await supabaseAdmin
		.from('call_list_contacts')
		.delete()
		.eq('call_list_id', params.id)
		.eq('contact_id', contact_id);
	return json({ success: true });
};
