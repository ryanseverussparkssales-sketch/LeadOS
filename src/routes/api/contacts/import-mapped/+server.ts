import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId, normalizePhone } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { rows, fieldMapping, callListId, createCustomFields, bulkTags, bulkClientId, bulkCampaignId, bulkContactType } = await request.json();
	// rows: approved preview rows only
	console.log('[import] bulk assignment:', { bulkCampaignId, bulkClientId, bulkContactType, bulkTags: bulkTags?.length });

	if (!rows?.length) throw error(400, 'rows required');

	// Create import batch for tracking + undo
	const { data: batch } = await supabaseAdmin.from('import_batches').insert({
		user_id: ownerId,
		filename: 'csv-import',
		source: 'csv',
		mode: 'create',
	}).select().single();

	// Create custom fields first if requested
	const customFieldMap: Record<string, string> = {}; // csvHeader → field_key
	for (const cf of createCustomFields ?? []) {
		const { data } = await supabaseAdmin.from('contact_field_definitions').upsert({
			user_id: ownerId, name: cf.fieldName, field_key: cf.fieldKey, field_type: cf.fieldType ?? 'text',
		}, { onConflict: 'user_id,field_key' }).select().single();
		if (data) customFieldMap[cf.csvHeader] = cf.fieldKey;
	}

	let created = 0, errors = 0;

	for (const row of rows) {
		const rec = row.record as Record<string, string>;

		const phone = rec.phone?.trim() ?? '';
		const phoneNorm = phone ? normalizePhone(phone) : null;
		const email = rec.email?.trim() || null;

		// Skip dedup check since preview already handled it
		const { data: contact, error: e } = await supabaseAdmin.from('contacts').insert({
			user_id: ownerId,
			name: rec.name || 'Unknown',
			phone: phone || '',
			phone_normalized: phoneNorm,
			email: email,
			email_normalized: email ? email.toLowerCase() : null,
			company: rec.company?.trim() || null,
			title: rec.title?.trim() || null,
			website: rec.website?.trim() || null,
			linkedin_url: rec.linkedin_url?.trim() || null,
			contact_type: bulkContactType || rec.contact_type?.toLowerCase() || 'lead',
			lead_source: rec.lead_source?.trim() || 'csv_import',
			notes: rec.notes?.trim() || null,
			is_business: ['yes','true','1','y'].includes(rec.is_business?.toLowerCase() ?? ''),
			status: 'active',
			import_batch_id: batch?.id ?? null,
			utm_source: rec.utm_source?.trim() || null,
			utm_medium: rec.utm_medium?.trim() || null,
			utm_campaign: rec.utm_campaign?.trim() || null,
			utm_content: rec.utm_content?.trim() || null,
			utm_term: rec.utm_term?.trim() || null,
		}).select('id').single();

		if (e) { errors++; continue; }
		created++;

		// Save custom field values
		if (contact?.id) {
			for (const [csvHeader, fieldKey] of Object.entries(customFieldMap)) {
				const value = rec[csvHeader]?.trim();
				if (!value) continue;
				const { data: fieldDef } = await supabaseAdmin.from('contact_field_definitions').select('id').eq('user_id', ownerId).eq('field_key', fieldKey).single();
				if (fieldDef) {
					await supabaseAdmin.from('contact_field_values').upsert({ contact_id: contact.id, field_definition_id: fieldDef.id, value }, { onConflict: 'contact_id,field_definition_id' });
				}
			}
			// Add to call list if specified
			if (callListId) {
				await supabaseAdmin.from('call_list_contacts').upsert({ call_list_id: callListId, contact_id: contact.id, status:'pending' }, { onConflict:'call_list_id,contact_id' });
			}

			// Bulk assignment
			const bulkPromises = [];

			// Add tags if provided
			if (bulkTags?.length) {
				bulkPromises.push(
					supabaseAdmin.from('contacts')
						.update({ tags: bulkTags })
						.eq('id', contact.id)
				);
			}

			// Link to client if provided
			if (bulkClientId) {
				bulkPromises.push(
					supabaseAdmin.from('contact_client_assoc')
						.upsert({ contact_id: contact.id, client_id: bulkClientId, user_id: ownerId }, { onConflict: 'contact_id,client_id' })
				);
			}

			// Link directly to campaign via campaign_contacts AND Default call list (for dialer)
			if (bulkCampaignId) {
				await supabaseAdmin.from('campaign_contacts')
					.insert({ campaign_id: bulkCampaignId, contact_id: contact.id })
					.then(({ error: ccErr }) => {
						if (ccErr && !ccErr.message?.includes('duplicate')) {
						console.error('[import-mapped] campaign_contacts error:', ccErr.message);
					}
				}
			}
		}
	}

	return json({ created, updated, skipped, errors });
};
