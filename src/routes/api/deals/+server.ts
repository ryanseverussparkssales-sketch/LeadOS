import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const clientId = url.searchParams.get('client_id')?.trim() ?? '';
	let query = supabaseAdmin
		.from('deals')
		.select('*, contact:contacts(id, name, company, phone), client:clients(id, name)')
		.eq('user_id', ownerId)
		.is('deleted_at', null);
	if (clientId && UUID_RE.test(clientId)) query = query.eq('client_id', clientId);
	const { data } = await query
		.order('updated_at', { ascending: false })
		.limit(500);
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { title, contactId, clientId, campaignId, value, stage, probability, expectedClose, notes } = await request.json();
	if (!title?.trim()) throw error(400, 'title required');
	if (contactId) {
		const { data: contact } = await supabaseAdmin
			.from('contacts').select('id').eq('id', contactId).eq('user_id', ownerId).single();
		if (!contact) throw error(404, 'Contact not found');
	}
	if (clientId) {
		const { data: client } = await supabaseAdmin
			.from('clients').select('id').eq('id', clientId).eq('user_id', ownerId).single();
		if (!client) throw error(404, 'Client not found');
	}
	const { data, error: e } = await supabaseAdmin.from('deals').insert({
		user_id: ownerId,
		title: title.trim(),
		contact_id: contactId ?? null,
		client_id: clientId ?? null,
		campaign_id: campaignId ?? null,
		value: value ?? 0,
		stage: stage ?? 'prospect',
		probability: probability ?? 20,
		expected_close: expectedClose ?? null,
		notes: notes ?? null,
	}).select('*, contact:contacts(id, name, company), client:clients(id, name)').single();
	if (e) throw error(400, e.message);
	return json(data);
};
