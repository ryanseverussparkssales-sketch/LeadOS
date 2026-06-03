import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

async function verifyProjectOwner(projectId: string, userId: string) {
	const { data } = await supabaseAdmin
		.from('projects')
		.select('id, client:clients(user_id)')
		.eq('id', projectId)
		.single();
	if (!data || (data.client as { user_id: string })?.user_id !== userId)
		throw error(403, 'Forbidden');
	return data;
}

export const GET: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	await verifyProjectOwner(params.id, user.id);
	const { data } = await supabaseAdmin
		.from('projects')
		.select('*, client:clients(id, name), call_lists(*, call_list_contacts(count))')
		.eq('id', params.id)
		.single();
	return json(data);
};

export const PATCH: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	await verifyProjectOwner(params.id, user.id);
	const body = await request.json();

	if (body.restore === true) {
		const { data, error: e } = await supabaseAdmin
			.from('projects')
			.update({ deleted_at: null })
			.eq('id', params.id)
			.select()
			.single();
		if (e) throw error(400, e.message);
		return json(data);
	}

	const { data, error: e } = await supabaseAdmin
		.from('projects').update(body).eq('id', params.id).select().single();
	if (e) throw error(400, e.message);
	return json(data);
};

export const PUT: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	await verifyProjectOwner(params.id, user.id);
	const { name } = await request.json();
	const { data, error: e } = await supabaseAdmin
		.from('projects').update({ name }).eq('id', params.id).select().single();
	if (e) throw error(400, e.message);
	return json(data);
};

export const DELETE: RequestHandler = async ({ request, params, url }) => {
	const user = await requireAuth(request);
	await verifyProjectOwner(params.id, user.id);
	const permanent = url.searchParams.get('permanent') === 'true';
	if (permanent) {
		await supabaseAdmin.from('projects').delete().eq('id', params.id);
	} else {
		const { error: e } = await supabaseAdmin
			.from('projects')
			.update({ deleted_at: new Date().toISOString() })
			.eq('id', params.id);
		if (e) throw error(400, e.message);
	}
	return json({ success: true });
};
