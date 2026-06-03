import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { data } = await supabaseAdmin
		.from('lead_sources')
		.select('*, client:clients(name), campaign:campaigns(name), call_list:call_lists(name)')
		.eq('user_id', user.id)
		.order('created_at', { ascending: false });
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { name, sourceType, clientId, campaignId, autoCallListId, defaultContactType } = await request.json();
	if (!name?.trim()) throw error(400, 'name required');
	const { data, error: e } = await supabaseAdmin
		.from('lead_sources')
		.insert({ user_id: user.id, name: name.trim(), source_type: sourceType ?? 'webhook', client_id: clientId ?? null, campaign_id: campaignId ?? null, auto_call_list_id: autoCallListId ?? null, default_contact_type: defaultContactType ?? 'lead' })
		.select('*, client:clients(name), campaign:campaigns(name)')
		.single();
	if (e) throw error(400, e.message);
	return json(data);
};
