import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const { contactId, flagged, notes, product } = await request.json();
	if (!contactId) throw error(400, 'contactId required');

	const { data, error: e } = await supabaseAdmin
		.from('contacts')
		.update({
			flagged_own_pipeline: flagged ?? true,
			own_pipeline_notes: notes ?? null,
			own_pipeline_product: product ?? null,
			own_pipeline_flagged_at: flagged !== false ? new Date().toISOString() : null,
		})
		.eq('id', contactId)
		.eq('user_id', ownerId)
		.select('id, name, flagged_own_pipeline, own_pipeline_notes, own_pipeline_product')
		.single();

	if (e) throw error(400, e.message);
	return json(data);
};

// GET: list all flagged contacts
export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	const { data } = await supabaseAdmin
		.from('contacts')
		.select('id, name, phone, company, title, email, own_pipeline_notes, own_pipeline_product, own_pipeline_flagged_at, tags:contact_tag_mappings(tag:contact_tags(*))')
		.eq('user_id', ownerId)
		.eq('flagged_own_pipeline', true)
		.order('own_pipeline_flagged_at', { ascending: false });

	return json((data ?? []).map(c => ({
		...c,
		tags: (c.tags as Array<{tag:Record<string,unknown>}>)?.map(t => t.tag).filter(Boolean) ?? []
	})));
};
