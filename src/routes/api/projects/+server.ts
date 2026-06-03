import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const clientId = url.searchParams.get('client_id');

	let query = supabaseAdmin
		.from('projects')
		.select('*, client:clients(id, name, user_id), call_lists(id, name, status)')
		.is('deleted_at', null)
		.order('name');

	if (clientId) {
		query = query.eq('client_id', clientId);
	} else {
		// Only return projects for this user's clients
		query = query.eq('client.user_id', user.id);
	}

	const { data } = await query;
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { name, client_id } = await request.json();
	if (!name?.trim() || !client_id) throw error(400, 'name and client_id required');

	// Verify client ownership
	const { data: client } = await supabaseAdmin
		.from('clients').select('id').eq('id', client_id).eq('user_id', user.id).single();
	if (!client) throw error(403, 'Forbidden');

	const { data, error: e } = await supabaseAdmin
		.from('projects')
		.insert({ client_id, name: name.trim() })
		.select()
		.single();
	if (e) throw error(400, e.message);
	return json(data);
};
