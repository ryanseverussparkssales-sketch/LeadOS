import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const contactId  = url.searchParams.get('contact_id');
	const campaignId = url.searchParams.get('campaign_id');
	const clientId   = url.searchParams.get('client_id');
	const direction  = url.searchParams.get('direction');
	const limit      = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);

	let q = supabaseAdmin
		.from('email_logs')
		.select('*, contact:contacts(name, company)')
		.eq('user_id', user.id)
		.order('created_at', { ascending: false })
		.limit(limit);

	if (contactId)  q = q.eq('contact_id', contactId);
	if (campaignId) q = q.eq('campaign_id', campaignId);
	if (clientId)   q = q.eq('client_id', clientId);
	if (direction)  q = q.eq('direction', direction);
	return json({ success: true });
};
