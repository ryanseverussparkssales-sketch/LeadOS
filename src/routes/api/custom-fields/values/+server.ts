import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// supabaseAdmin bypasses RLS, so every query MUST be owner-scoped. contact_field_values
// has no user_id of its own — ownership is proven through the parent contact (and, on
// write, the field definition). Without these checks any authenticated user could read or
// write custom-field values for any contact in any tenant.
async function assertContactOwned(contactId: string, ownerId: string) {
	const { data } = await supabaseAdmin
		.from('contacts').select('id').eq('id', contactId).eq('user_id', ownerId).maybeSingle();
	if (!data) throw error(404, 'Contact not found');
}

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const contactId = url.searchParams.get('contact_id');
	if (!contactId) return json([]);
	await assertContactOwned(contactId, ownerId);

	const { data } = await supabaseAdmin
		.from('contact_field_values')
		.select('*, definition:contact_field_definitions(*)')
		.eq('contact_id', contactId);
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { contactId, fieldDefinitionId, value } = await request.json();
	if (!contactId || !fieldDefinitionId) throw error(400, 'contactId and fieldDefinitionId required');

	await assertContactOwned(contactId, ownerId);

	// The field definition must also belong to this owner.
	const { data: def } = await supabaseAdmin
		.from('contact_field_definitions').select('id').eq('id', fieldDefinitionId).eq('user_id', ownerId).maybeSingle();
	if (!def) throw error(404, 'Field definition not found');

	const { data } = await supabaseAdmin
		.from('contact_field_values')
		.upsert(
			{ contact_id: contactId, field_definition_id: fieldDefinitionId, value, updated_at: new Date().toISOString() },
			{ onConflict: 'contact_id,field_definition_id' }
		)
		.select().single();
	return json(data);
};
