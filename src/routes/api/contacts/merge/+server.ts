import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { primaryId, mergeId } = await request.json();
	if (!primaryId || !mergeId) throw error(400, 'primaryId and mergeId required');

	// Verify ownership
	const { data: primary } = await supabaseAdmin.from('contacts').select('id').eq('id', primaryId).eq('user_id', ownerId).single();
	const { data: merge } = await supabaseAdmin.from('contacts').select('id').eq('id', mergeId).eq('user_id', ownerId).single();
	if (!primary || !merge) throw error(403, 'Contacts not found');

	// Transfer all related records
	await Promise.all([
		supabaseAdmin.from('calls').update({ contact_id: primaryId }).eq('contact_id', mergeId),
		supabaseAdmin.from('sms_logs').update({ contact_id: primaryId }).eq('contact_id', mergeId),
		supabaseAdmin.from('email_logs').update({ contact_id: primaryId }).eq('contact_id', mergeId),
		supabaseAdmin.from('tasks').update({ contact_id: primaryId }).eq('contact_id', mergeId),
		supabaseAdmin.from('deals').update({ contact_id: primaryId }).eq('contact_id', mergeId),
		supabaseAdmin.from('call_list_contacts').update({ contact_id: primaryId }).eq('contact_id', mergeId).then(async () =>
			// Remove duplicates in call_list_contacts
			supabaseAdmin.from('call_list_contacts').delete().eq('contact_id', mergeId)
		),
	]);

	// Transfer tags (avoid duplicates)
	const { data: mergeTags } = await supabaseAdmin.from('contact_tag_mappings').select('tag_id').eq('contact_id', mergeId);
	for (const t of mergeTags ?? []) {
		await supabaseAdmin.from('contact_tag_mappings').upsert({ contact_id: primaryId, tag_id: t.tag_id }, { onConflict: 'contact_id,tag_id' });
	}

	// Soft-delete merged contact
	await supabaseAdmin.from('contacts').update({ deleted_at: new Date().toISOString() }).eq('id', mergeId);

	// Update primary call count
	const { count } = await supabaseAdmin.from('calls').select('id', { count: 'exact' }).eq('contact_id', primaryId);
	await supabaseAdmin.from('contacts').update({ call_count: count ?? 0 }).eq('id', primaryId);

	return json({ success: true, primaryId });
};
