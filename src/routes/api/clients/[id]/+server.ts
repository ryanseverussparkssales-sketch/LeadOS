import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { data } = await supabaseAdmin
		.from('clients')
		.select('*, projects(*, call_lists(*, call_list_contacts(count)))')
		.eq('id', params.id)
		.eq('user_id', ownerId)
		.is('deleted_at', null)
		.single();
	if (!data) throw error(404, 'Not found');
	return json(data);
};

export const PATCH: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const body = await request.json();

	if (body.restore === true) {
		const { data, error: e } = await supabaseAdmin
			.from('clients')
			.update({ deleted_at: null })
			.eq('id', params.id)
			.eq('user_id', ownerId)
			.select()
			.single();
		if (e) throw error(400, e.message);
		return json(data);
	}

	const { data, error: e } = await supabaseAdmin
		.from('clients')
		.update(body)
		.eq('id', params.id)
		.eq('user_id', ownerId)
		.select()
		.single();
	if (e) throw error(400, e.message);
	return json(data);
};

export const PUT: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { name } = await request.json();
	const { data, error: e } = await supabaseAdmin
		.from('clients')
		.update({ name: name.trim() })
		.eq('id', params.id)
		.eq('user_id', ownerId)
		.select()
		.single();
	if (e) throw error(400, e.message);
	return json(data);
};

export const DELETE: RequestHandler = async ({ request, params, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const permanent = url.searchParams.get('permanent') === 'true';
	if (permanent) {
		await supabaseAdmin.from('clients').delete().eq('id', params.id).eq('user_id', ownerId);
	} else {
		const { error: e } = await supabaseAdmin
			.from('clients')
			.update({ deleted_at: new Date().toISOString() })
			.eq('id', params.id)
			.eq('user_id', ownerId);
		if (e) throw error(400, e.message);
	}
	return json({ success: true });
};
