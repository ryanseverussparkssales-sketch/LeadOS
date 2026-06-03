import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const status = url.searchParams.get('status');
	const contactId = url.searchParams.get('contact_id');
	const taskType = url.searchParams.get('task_type');
	const overdue = url.searchParams.get('overdue') === 'true';
	const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100'), 200);

	let q = supabaseAdmin
		.from('tasks')
		.select('*, contact:contacts(id, name, company, phone)')
		.eq('user_id', ownerId)
		.is('deleted_at', null)
		.order('due_date', { ascending: true, nullsFirst: false })
		.order('created_at', { ascending: false });

	if (status) q = q.eq('status', status);
	else q = q.neq('status', 'cancelled');
	if (contactId) q = q.eq('contact_id', contactId);
	if (taskType) q = q.eq('task_type', taskType);
	if (overdue) q = q.lt('due_date', new Date().toISOString()).neq('status', 'completed');

	const { data } = await q.limit(limit);
	return json(data ?? []);
};

export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { title, description, taskType, priority, status, dueDate, contactId, callId, campaignId, aiSuggested } = await request.json();
	if (!title?.trim()) throw error(400, 'title required');
	try {
		const { data, error: e } = await supabaseAdmin
			.from('tasks')
			.insert({ user_id: user.id, title: title.trim(), description: description ?? null, task_type: taskType ?? 'follow_up', priority: priority ?? 'medium', status: status ?? 'pending', due_date: dueDate ?? null, contact_id: contactId ?? null, call_id: callId ?? null, campaign_id: campaignId ?? null, ai_suggested: aiSuggested ?? false })
			.select('*, contact:contacts(id,name,company)')
			.single();
		if (e) throw error(500, e.message ?? 'Failed to create task');
		return json(data, { status: 201 });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		console.error('[tasks POST]', err);
		throw error(500, 'Internal server error');
	}
};
