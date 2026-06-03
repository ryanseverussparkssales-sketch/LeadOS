import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const contactId = url.searchParams.get('contact_id');
	if (!contactId) return json([]);
	const { data } = await supabaseAdmin.from('contact_field_values').select('*, definition:contact_field_definitions(*)').eq('contact_id', contactId);
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { contactId, fieldDefinitionId, value } = await request.json();
	const { data } = await supabaseAdmin.from('contact_field_values').upsert({ contact_id: contactId, field_definition_id: fieldDefinitionId, value, updated_at: new Date().toISOString() }, { onConflict: 'contact_id,field_definition_id' }).select().single();
	return json(data);
};
