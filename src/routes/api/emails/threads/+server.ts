import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const limit = parseInt(url.searchParams.get('limit') ?? '50');

	const { data: threads } = await supabaseAdmin
		.from('email_threads')
		.select(
			`
            id, subject, thread_key, last_message_at, last_message_body,
            last_message_direction, unread_count, message_count, contact_id,
            contacts(id, name, company, contact_score)
        `
		)
		.eq('user_id', ownerId)
		.order('last_message_at', { ascending: false })
		.limit(limit);

	const { count: totalUnread } = await supabaseAdmin
		.from('email_threads')
		.select('*', { count: 'exact', head: true })
		.eq('user_id', ownerId)
		.gt('unread_count', 0);

	return json({ threads: threads ?? [], totalUnread: totalUnread ?? 0 });
};
