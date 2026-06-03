import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	// Verify ownership
	const { data: batch } = await supabaseAdmin.from('import_batches').select('id, can_undo').eq('id', params.id).eq('user_id', ownerId).single();
	if (!batch) throw error(404, 'Batch not found');
	if (!batch.can_undo) throw error(400, 'This import cannot be undone — contacts have been modified since import');

	// Delete contacts that haven't been called or modified
	const { data: contacts } = await supabaseAdmin
		.from('contacts')
		.select('id')
		.eq('import_batch_id', params.id)
		.eq('user_id', ownerId)
		.eq('call_count', 0); // Only undo contacts that haven't been called

	const contactIds = (contacts ?? []).map(c => c.id);

	if (contactIds.length) {
		await supabaseAdmin.from('contacts').delete().in('id', contactIds);
	}

	// Mark batch as no longer undoable
	await supabaseAdmin.from('import_batches').update({ can_undo: false }).eq('id', params.id);

	return json({ deleted: contactIds.length, skipped: batch ? 0 : 0, message: `Deleted ${contactIds.length} contacts. Contacts that had calls were preserved.` });
};

export const GET: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { data: contacts } = await supabaseAdmin
		.from('contacts')
		.select('id, name, phone, company, call_count, created_at')
		.eq('import_batch_id', params.id)
		.eq('user_id', ownerId)
		.order('created_at');
	return json(contacts ?? []);
};
