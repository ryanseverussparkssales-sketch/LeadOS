import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// POST /api/tasks/bulk
// Body: { contactIds: string[], title, taskType, priority, dueDate, description }
// Creates one task per contact
export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const { contactIds, title, taskType, priority, dueDate, description } = await request.json();

	if (!contactIds?.length || !title?.trim()) throw error(400, 'contactIds and title required');
	if (contactIds.length > 200) throw error(400, 'Max 200 contacts per bulk operation');

	// Verify all contacts belong to user
	const { data: contacts } = await supabaseAdmin
		.from('contacts')
		.select('id, name')
		.eq('user_id', user.id)
		.in('id', contactIds);

	if (!contacts?.length) throw error(404, 'No matching contacts found');

	const rows = contacts.map(c => ({
		user_id: user.id,
		contact_id: c.id,
		title: title.trim(),
		description: description ?? null,
		task_type: taskType ?? 'follow_up',
		priority: priority ?? 'medium',
		status: 'pending',
		due_date: dueDate ?? null,
		ai_suggested: false,
	}));

	const { data, error: e } = await supabaseAdmin.from('tasks').insert(rows).select('id');
	if (e) throw error(500, e.message);

	return json({ created: data?.length ?? 0, taskIds: data?.map(t => t.id) ?? [] });
};
