import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params }) => {
	await requireAuth(request);

	// Verify the list exists (ownership via campaign hierarchy, no user_id on call_lists)
	const { data: list } = await supabaseAdmin
		.from('call_lists')
		.select('id')
		.eq('id', params.listId)
		.maybeSingle();

	if (!list) throw error(404, 'Call list not found');

	// Get the max queue_position in this list
	const { data: maxRow } = await supabaseAdmin
		.from('call_list_contacts')
		.select('queue_position')
		.eq('call_list_id', params.listId)
		.order('queue_position', { ascending: false })
		.limit(1)
		.maybeSingle();

	const newPosition = (maxRow?.queue_position ?? 0) + 1;

	// Move this contact to the back of the queue
	const { error: updateErr } = await supabaseAdmin
		.from('call_list_contacts')
		.update({ queue_position: newPosition })
		.eq('call_list_id', params.listId)
		.eq('contact_id', params.contactId);

	if (updateErr) throw error(500, updateErr.message);

	return json({ success: true, movedToPosition: newPosition });
};

// DELETE — undo a skip: move contact to front of queue
export const DELETE: RequestHandler = async ({ request, params }) => {
	await requireAuth(request);

	// Find the current minimum queue_position so we can go just before it
	const { data: minRow } = await supabaseAdmin
		.from('call_list_contacts')
		.select('queue_position')
		.eq('call_list_id', params.listId)
		.eq('status', 'pending')
		.order('queue_position', { ascending: true })
		.limit(1)
		.maybeSingle();

	const frontPosition = (minRow?.queue_position ?? 1) - 1;

	const { error: e } = await supabaseAdmin
		.from('call_list_contacts')
		.update({ queue_position: frontPosition, status: 'pending' })
		.eq('call_list_id', params.listId)
		.eq('contact_id', params.contactId);

	if (e) throw error(500, e.message);
	return json({ success: true });
};
