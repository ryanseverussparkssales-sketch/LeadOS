import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

/**
 * Verify the list belongs to the caller's (effective) tenant before touching
 * queue positions. Ownership can be direct (call_lists.user_id) or via either
 * hierarchy path (campaign→project→client or project→client). 404 on any miss.
 */
async function assertListOwner(listId: string, userId: string): Promise<void> {
	const ownerId = await getEffectiveUserId(userId);
	const { data } = await supabaseAdmin
		.from('call_lists')
		.select('id, user_id, project:projects(client:clients(user_id)), campaign:campaigns(project:projects(client:clients(user_id)))')
		.eq('id', listId)
		.maybeSingle();
	if (!data) throw error(404, 'Call list not found');
	const direct = (data as any).user_id;
	const viaProject = (data as any).project?.client?.user_id;
	const viaCampaign = (data as any).campaign?.project?.client?.user_id;
	if (![direct, viaProject, viaCampaign].includes(ownerId)) throw error(404, 'Call list not found');
}

export const POST: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	await assertListOwner(params.listId, user.id);

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
	const user = await requireAuth(request);
	await assertListOwner(params.listId, user.id);

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
