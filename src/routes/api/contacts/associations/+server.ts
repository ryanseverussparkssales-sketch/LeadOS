import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// GET /api/contacts/associations?contact_id=xxx
// Returns all associations for a contact: clients, campaigns, projects, call_lists
export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const contactId = url.searchParams.get('contact_id');
	if (!contactId) throw error(400, 'contact_id required');

	const [clientsRes, campaignsRes, projectsRes, listsRes] = await Promise.all([
		supabaseAdmin
			.from('contact_client_assoc')
			.select('id, client:clients(id, name)')
			.eq('contact_id', contactId)
			.eq('user_id', ownerId),

		supabaseAdmin
			.from('contact_campaign_assoc')
			.select('id, campaign:campaigns(id, name, project:projects(id, name, client:clients(id, name)))')
			.eq('contact_id', contactId)
			.eq('user_id', ownerId),

		supabaseAdmin
			.from('contact_project_assoc')
			.select('id, project:projects(id, name, client:clients(id, name))')
			.eq('contact_id', contactId)
			.eq('user_id', ownerId),

		supabaseAdmin
			.from('call_list_contacts')
			.select('id, call_list:call_lists(id, name, campaign:campaigns(id, name))')
			.eq('contact_id', contactId),
	]);

	return json({
		clients:   (clientsRes.data ?? []).map(r => ({ assocId: r.id, ...(r.client as object) })),
		campaigns: (campaignsRes.data ?? []).map(r => ({ assocId: r.id, ...(r.campaign as object) })),
		projects:  (projectsRes.data ?? []).map(r => ({ assocId: r.id, ...(r.project as object) })),
		callLists: (listsRes.data ?? []).map(r => ({ assocId: r.id, ...(r.call_list as object) })),
	});
};

// POST /api/contacts/associations — add an association
// Body: { contactId, type: 'client'|'campaign'|'project'|'call_list', targetId }
export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { contactId, type, targetId } = await request.json();
	if (!contactId || !type || !targetId) throw error(400, 'contactId, type, targetId required');

	if (type === 'client') {
		const { data, error: e } = await supabaseAdmin
			.from('contact_client_assoc')
			.upsert({ contact_id: contactId, client_id: targetId, user_id: user.id }, { onConflict: 'contact_id,client_id' })
			.select().single();
		if (e) throw error(500, e.message);
		return json(data, { status: 201 });
	}
	if (type === 'campaign') {
		const { data, error: e } = await supabaseAdmin
			.from('contact_campaign_assoc')
			.upsert({ contact_id: contactId, campaign_id: targetId, user_id: user.id }, { onConflict: 'contact_id,campaign_id' })
			.select().single();
		if (e) throw error(500, e.message);
		return json(data, { status: 201 });
	}
	if (type === 'project') {
		const { data, error: e } = await supabaseAdmin
			.from('contact_project_assoc')
			.upsert({ contact_id: contactId, project_id: targetId, user_id: user.id }, { onConflict: 'contact_id,project_id' })
			.select().single();
		if (e) throw error(500, e.message);
		return json(data, { status: 201 });
	}
	if (type === 'call_list') {
		// Add to call list queue
		const { data, error: e } = await supabaseAdmin
			.from('call_list_contacts')
			.upsert({ call_list_id: targetId, contact_id: contactId, status: 'pending' }, { onConflict: 'call_list_id,contact_id' })
			.select().single();
		if (e) throw error(500, e.message);
		return json(data, { status: 201 });
	}
	throw error(400, 'Invalid type');
};

// DELETE /api/contacts/associations?type=client&assocId=xxx
export const DELETE: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const type = url.searchParams.get('type');
	const assocId = url.searchParams.get('assocId');
	if (!type || !assocId) throw error(400, 'type and assocId required');

	if (type === 'client') {
		await supabaseAdmin.from('contact_client_assoc').delete().eq('id', assocId).eq('user_id', ownerId);
	} else if (type === 'campaign') {
		await supabaseAdmin.from('contact_campaign_assoc').delete().eq('id', assocId).eq('user_id', ownerId);
	} else if (type === 'project') {
		await supabaseAdmin.from('contact_project_assoc').delete().eq('id', assocId).eq('user_id', ownerId);
	} else if (type === 'call_list') {
		// Verify the contact belongs to the user before removing from call list
		const { data: clc } = await supabaseAdmin
			.from('call_list_contacts')
			.select('contact:contacts(user_id)')
			.eq('id', assocId)
			.maybeSingle();
		if ((clc?.contact as {user_id:string})?.user_id !== ownerId) throw error(403, 'Forbidden');
		await supabaseAdmin.from('call_list_contacts').delete().eq('id', assocId);
	} else {
		throw error(400, 'Invalid type');
	}
	return json({ ok: true });
};
