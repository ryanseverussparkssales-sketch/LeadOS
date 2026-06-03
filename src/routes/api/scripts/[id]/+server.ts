import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const { data } = await supabaseAdmin
		.from('scripts')
		.select('*, client:clients(name), campaign:campaigns(name), objections:script_objections(*)')
		.eq('id', params.id).eq('user_id', user.id).single();
	if (!data) throw error(404, 'Script not found');
	return json(data);
};

export const PUT: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const { title, opener, elevatorPitch, discovery, closing, clientId, campaignId, isDefault } = await request.json();
	if (isDefault) await supabaseAdmin.from('scripts').update({ is_default: false }).eq('user_id', user.id);
	const { data, error: e } = await supabaseAdmin
		.from('scripts')
		.update({ title, opener, elevator_pitch: elevatorPitch, discovery, closing, client_id: clientId ?? null, campaign_id: campaignId ?? null, is_default: isDefault ?? false, updated_at: new Date().toISOString() })
		.eq('id', params.id).eq('user_id', user.id).select().single();
	if (e) throw error(400, e.message);
	return json(data);
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	await supabaseAdmin.from('scripts').delete().eq('id', params.id).eq('user_id', user.id);
	return json({ success: true });
};
