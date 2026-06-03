import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const clientId   = url.searchParams.get('client_id');
	const projectId  = url.searchParams.get('project_id');
	const campaignId = url.searchParams.get('campaign_id');
	const dateFrom   = url.searchParams.get('date_from');
	const dateTo     = url.searchParams.get('date_to');

	let q = supabaseAdmin
		.from('time_entries')
		.select('*, client:clients(id,name), project:projects(id,name), campaign:campaigns(id,name)')
		.eq('user_id', user.id)
		.order('entry_date', { ascending: false })
		.order('created_at', { ascending: false });

	if (clientId)   q = q.eq('client_id', clientId);
	if (projectId)  q = q.eq('project_id', projectId);
	if (campaignId) q = q.eq('campaign_id', campaignId);
	if (dateFrom)   q = q.gte('entry_date', dateFrom);
	if (dateTo)     q = q.lte('entry_date', dateTo);

	const { data } = await q;
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const body = await request.json();
	const { clientId, projectId, campaignId, description, durationMinutes, billable, hourlyRate, entryDate } = body;

	if (!durationMinutes || durationMinutes <= 0) throw error(400, 'durationMinutes required');

	const { data, error: e } = await supabaseAdmin
		.from('time_entries')
		.insert({
			user_id: user.id,
			client_id: clientId ?? null,
			project_id: projectId ?? null,
			campaign_id: campaignId ?? null,
			description: description ?? null,
			duration_minutes: durationMinutes,
			billable: billable ?? true,
			hourly_rate: hourlyRate ?? null,
			entry_date: entryDate ?? new Date().toISOString().slice(0, 10),
		})
		.select('*, client:clients(id,name), project:projects(id,name), campaign:campaigns(id,name)')
		.single();

	if (e) throw error(400, e.message);
	return json(data);
};
