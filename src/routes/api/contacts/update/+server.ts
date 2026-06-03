import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { id, ...fields } = await request.json();
	if (!id) throw error(400, 'id required');

	const allowed = ['name','phone','email','company','title','status','contact_type','lead_source',
		'is_business','notes','customer_since','linkedin_url','website','do_not_email'];
	const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
	for (const key of allowed) {
		if (key in fields) update[key] = fields[key];
	}

	const { data, error: e } = await supabaseAdmin
		.from('contacts').update(update).eq('id', id).eq('user_id', user.id).select().single();
	if (e) throw error(400, e.message);
	return json(data);
};
