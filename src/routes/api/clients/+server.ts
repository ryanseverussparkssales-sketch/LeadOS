import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const includeTest = url.searchParams.get('include_test') === 'true';
	let query = supabaseAdmin
		.from('clients')
		.select('*, projects(id, name, call_lists(id, name, status))')
		.eq('user_id', ownerId)
		.is('deleted_at', null)
		.order('name')
		.limit(200);
	if (!includeTest) query = query.eq('is_test', false);
	const { data } = await query;
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const {
		name, website, industry, description, logo_url,
		primary_contact_name, primary_contact_email, primary_contact_phone,
		linkedin_url, contract_value, contract_status, tags, timezone, notes
	} = await request.json();
	if (!name?.trim()) throw error(400, 'Name required');
	const { data, error: e } = await supabaseAdmin
		.from('clients')
		.insert({
			user_id: user.id,
			name: name.trim(),
			website: website ?? null,
			industry: industry ?? null,
			description: description ?? null,
			logo_url: logo_url ?? null,
			primary_contact_name: primary_contact_name ?? null,
			primary_contact_email: primary_contact_email ?? null,
			primary_contact_phone: primary_contact_phone ?? null,
			linkedin_url: linkedin_url ?? null,
			contract_value: contract_value ?? null,
			contract_status: contract_status ?? 'active',
			tags: tags ?? null,
			timezone: timezone ?? null,
			notes: notes ?? null,
		})
		.select()
		.single();
	if (e) throw error(400, e.message);
	return json(data);
};
