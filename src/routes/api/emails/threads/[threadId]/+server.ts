import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// GET — load messages in a thread
export const GET: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	const { data: messages } = await supabaseAdmin
		.from('email_logs')
		.select(
			'id, subject, body, from_address, to_address, direction, status, created_at, intent_label, intent_score, attachments, read_at'
		)
		.eq('email_thread_id', params.threadId)
		.eq('user_id', ownerId)
		.order('created_at', { ascending: true });

	return json(messages ?? []);
};

// POST — mark thread as read
export const POST: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const now = new Date().toISOString();

	await supabaseAdmin
		.from('email_logs')
		.update({ read_at: now })
		.eq('email_thread_id', params.threadId)
		.eq('user_id', ownerId)
		.eq('direction', 'inbound')
		.is('read_at', null);

	await supabaseAdmin
		.from('email_threads')
		.update({ unread_count: 0 })
		.eq('id', params.threadId)
		.eq('user_id', ownerId);

	return json({ success: true });
};
