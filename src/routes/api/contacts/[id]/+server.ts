import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getUserRole, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	const { data, error: dbErr } = await supabaseAdmin
		.from('contacts')
		.select('*, tags:contact_tag_mappings(tag:contact_tags(*))')
		.eq('id', params.id)
		.eq('user_id', ownerId)
		.is('deleted_at', null)
		.single();

	// Also fetch associated campaigns/clients via call_list_contacts
	if (data) {
		const { data: assoc } = await supabaseAdmin
			.from('call_list_contacts')
			.select('call_list:call_lists(id, name, campaign:campaigns(id, name, project:projects(id, name, client:clients(id, name))))')
			.eq('contact_id', params.id)
			.limit(20);
		(data as Record<string, unknown>).associations = assoc?.map(a => a.call_list).filter(Boolean) ?? [];
	}

	if (dbErr || !data) throw error(404, 'Contact not found');
	return json(data);
};

export const PATCH: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const body = await request.json();

	if (body.restore === true) {
		const { data, error: e } = await supabaseAdmin
			.from('contacts')
			.update({ deleted_at: null })
			.eq('id', params.id)
			.eq('user_id', ownerId)
			.select()
			.single();
		if (e) throw error(400, e.message);
		return json(data);
	}

	const { data, error: e } = await supabaseAdmin
		.from('contacts')
		.update(body)
		.eq('id', params.id)
		.eq('user_id', ownerId)
		.select()
		.single();
	if (e) throw error(400, e.message);
	return json(data);
};

export const DELETE: RequestHandler = async ({ request, params, url }) => {
	const user = await requireAuth(request);
	// Only account owners can delete contacts — reps cannot
	const { role } = await getUserRole(user.id);
	if (role !== 'owner') throw error(403, 'Only account owners can delete contacts');
	const ownerId = await getEffectiveUserId(user.id);
	const permanent = url.searchParams.get('permanent') === 'true';

	if (permanent) {
		const { error: e } = await supabaseAdmin
			.from('contacts').delete()
			.eq('id', params.id).eq('user_id', ownerId);
		if (e) throw error(400, e.message);
	} else {
		const { error: e } = await supabaseAdmin
			.from('contacts').update({ deleted_at: new Date().toISOString() })
			.eq('id', params.id).eq('user_id', ownerId);
		if (e) throw error(400, e.message);
	}
	return json({ success: true });
};
