import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getUserRole, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const body = await request.json();
	if (body.status === 'completed' && !body.completed_at) body.completed_at = new Date().toISOString();
	// Allow patching tasks owned by the account owner OR tasks the rep created themselves
	const { data, error: e } = await supabaseAdmin
		.from('tasks')
		.update(body)
		.eq('id', params.id)
		.or(`user_id.eq.${ownerId},user_id.eq.${user.id}`)
		.select('*, contact:contacts(id,name,company)')
		.single();
	if (e) throw error(400, e.message);
	return json(data);
};

export const DELETE: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const { role } = await getUserRole(user.id);
	const ownerId = await getEffectiveUserId(user.id);

	if (role === 'owner') {
		await supabaseAdmin.from('tasks').delete().eq('id', params.id).eq('user_id', ownerId);
	} else {
		const { data: task } = await supabaseAdmin.from('tasks').select('user_id').eq('id', params.id).maybeSingle();
		if (!task) throw error(404, 'Task not found');
		if (task.user_id !== user.id) throw error(403, 'You can only delete your own tasks');
		await supabaseAdmin.from('tasks').delete().eq('id', params.id).eq('user_id', user.id);
	}

	return json({ success: true });
};
