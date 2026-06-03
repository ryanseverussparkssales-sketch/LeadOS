import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId, normalizePhone } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { rows, fieldMapping, updateFields, callListId, filename } = await request.json();
	// updateFields: array of field keys to update on existing contacts (e.g. ['company','title','notes'])

	if (!rows?.length) throw error(400, 'rows required');

	// Create import batch
	const { data: batch } = await supabaseAdmin.from('import_batches').insert({
		user_id: ownerId, filename: filename ?? 'sync-import.csv', source: 'sync', mode: 'sync',
	}).select().single();

	let created = 0, updated = 0, skipped = 0, errors = 0;
	const allowedUpdateFields = updateFields ?? ['company', 'title', 'email', 'website', 'linkedin_url', 'notes', 'contact_type', 'lead_source'];

	for (const row of rows) {
		const rec = row.record as Record<string, string>;
		const phone = rec.phone?.trim() ?? '';
		const email = rec.email?.trim() || null;
		const phoneNorm = phone ? normalizePhone(phone) : null;

		// Find existing contact
		let existing = null;
		if (phoneNorm) {
			const { data } = await supabaseAdmin.from('contacts').select('id, call_count').eq('user_id', ownerId).eq('phone_normalized', phoneNorm).maybeSingle();
			existing = data;
		}
		if (!existing && email) {
			const { data } = await supabaseAdmin.from('contacts').select('id, call_count').eq('user_id', ownerId).eq('email_normalized', email.toLowerCase()).maybeSingle();
			existing = data;
		}

		if (existing) {
			// Update allowed fields
			const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
			for (const field of allowedUpdateFields) {
				if (rec[field]?.trim()) updatePayload[field] = rec[field].trim();
			}
			await supabaseAdmin.from('contacts').update(updatePayload).eq('id', existing.id);
			updated++;
		} else if (row.status !== 'invalid') {
			// Create new
			const { data: contact, error: e } = await supabaseAdmin.from('contacts').insert({
				user_id: ownerId,
				name: rec.name || 'Unknown',
				phone: phone || '',
				phone_normalized: phoneNorm,
				email, email_normalized: email ? email.toLowerCase() : null,
				company: rec.company?.trim() || null,
				title: rec.title?.trim() || null,
				notes: rec.notes?.trim() || null,
				contact_type: rec.contact_type?.toLowerCase() || 'lead',
				lead_source: rec.lead_source?.trim() || 'csv_import',
				status: 'active',
				import_batch_id: batch?.id ?? null,
			}).select('id').single();
			if (e) { errors++; }
			else {
				created++;
				if (contact && callListId) {
					await supabaseAdmin.from('call_list_contacts').upsert({ call_list_id: callListId, contact_id: contact.id, status:'pending' }, { onConflict:'call_list_id,contact_id' });
				}
			}
		} else skipped++;
	}

	// Update batch stats
	if (batch) {
		await supabaseAdmin.from('import_batches').update({ total_created: created, total_updated: updated, total_skipped: skipped }).eq('id', batch.id);
	}

	return json({ created, updated, skipped, errors, batchId: batch?.id });
};
