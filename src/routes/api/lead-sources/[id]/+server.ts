import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const body = await request.json();
	const { data, error: e } = await supabaseAdmin
		.from('lead_sources')
		.update({
			name: body.name,
			status: body.status,
			campaign_id: body.campaign_id ?? null,
			client_id: body.client_id ?? null,
			auto_call_list_id: body.auto_call_list_id ?? null,
			default_contact_type: body.default_contact_type ?? 'lead',
			description: body.description ?? null,
			updated_at: new Date().toISOString(),
		})
		.eq('id', params.id)
		.eq('user_id', user.id)
		.select()
		.single();
	if (e) throw error(400, e.message);
	return json(data);
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const { error: e } = await supabaseAdmin
		.from('lead_sources')
		.delete()
		.eq('id', params.id)
		.eq('user_id', user.id);
	if (e) throw error(400, e.message);
	return json({ ok: true });
};
