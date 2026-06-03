import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { contactIds, action, value } = await request.json();

	if (!contactIds?.length || !action) throw error(400, 'contactIds and action required');
	// Verify all contacts belong to user
	const { data: contacts } = await supabaseAdmin.from('contacts').select('id').in('id', contactIds).eq('user_id', ownerId);
	const validIds = (contacts ?? []).map(c => c.id);
	if (!validIds.length) throw error(403, 'No valid contacts');

	let updated = 0;
	switch (action) {
		case 'change_status':
			await supabaseAdmin.from('contacts').update({ status: value }).in('id', validIds);
			updated = validIds.length;
			break;
		case 'add_tag':
			const { data: tag } = await supabaseAdmin.from('contact_tags').select('id').eq('user_id', ownerId).eq('name', value).maybeSingle();
			let tagId = tag?.id;
			if (!tagId) {
				const { data: newTag } = await supabaseAdmin.from('contact_tags').insert({ user_id: ownerId, name: value, color: '#6366f1' }).select('id').single();
				tagId = newTag?.id;
			}
			if (tagId) {
				await supabaseAdmin.from('contact_tag_mappings').upsert(validIds.map(id => ({ contact_id: id, tag_id: tagId })), { onConflict: 'contact_id,tag_id' });
				updated = validIds.length;
			}
			break;
		case 'add_to_list':
			await supabaseAdmin.from('call_list_contacts').upsert(validIds.map((id, i) => ({ call_list_id: value, contact_id: id, status: 'pending', queue_position: i })), { onConflict: 'call_list_id,contact_id' });
			updated = validIds.length;
			break;
		case 'score':
			return json({ error: 'Use individual score endpoint' }, { status: 400 });
		case 'delete':
			await supabaseAdmin.from('contacts').update({ deleted_at: new Date().toISOString() }).in('id', validIds).eq('user_id', ownerId);
			updated = validIds.length;
			break;
	}
	return json({ updated });
};
