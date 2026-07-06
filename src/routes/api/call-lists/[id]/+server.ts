import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

async function verifyListOwner(listId: string, userId: string) {
	const ownerId = await getEffectiveUserId(userId);
	const { data } = await supabaseAdmin
		.from('call_lists')
		.select('id, project:projects(client:clients(user_id))')
		.eq('id', listId)
		.single();
	const owner = (data?.project as unknown as { client: { user_id: string } })?.client?.user_id;
	if (!data || owner !== ownerId) throw error(403, 'Forbidden');
	return data;
}

export const GET: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	await verifyListOwner(params.id, user.id);
	const { data } = await supabaseAdmin
		.from('call_lists')
		.select('*, project:projects(id, name, client:clients(id, name))')
		.eq('id', params.id)
		.single();
	return json(data);
};

export const PUT: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	await verifyListOwner(params.id, user.id);
	const { name, status } = await request.json();
	const { data, error: e } = await supabaseAdmin
		.from('call_lists').update({ name, status }).eq('id', params.id).select().single();
	if (e) throw error(400, e.message);
	return json(data);
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	await verifyListOwner(params.id, user.id);
	await supabaseAdmin.from('call_list_contacts').delete().eq('call_list_id', params.id);
	await supabaseAdmin.from('call_lists').delete().eq('id', params.id);
	return json({ success: true });
};
