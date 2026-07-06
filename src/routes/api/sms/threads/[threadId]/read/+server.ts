import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params }) => {
	const user = await requireAuth(request);
	const now = new Date().toISOString();

	// Verify the thread belongs to the caller before touching its messages
	const { data: thread } = await supabaseAdmin
		.from('sms_threads')
		.select('id')
		.eq('id', params.threadId)
		.eq('user_id', user.id)
		.maybeSingle();
	if (!thread) return json({ success: false }, { status: 404 });

	// Mark all unread inbound messages in this thread as read
	await supabaseAdmin
		.from('sms_logs')
		.update({ read_at: now })
		.eq('sms_thread_id', params.threadId)
		.eq('direction', 'inbound')
		.is('read_at', null);

	// Reset unread count on thread
	await supabaseAdmin
		.from('sms_threads')
		.update({ unread_count: 0 })
		.eq('id', params.threadId)
		.eq('user_id', user.id);

	return json({ success: true });
};
