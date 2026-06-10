import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	// Pagination: limit (capped) + offset, with the total thread count so the
	// client can page. Response object gains `total`/`offset`/`limit` (non-breaking).
	const limit  = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '50'), 1), 200);
	const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0'), 0);

	const { data: threads, count: total } = await supabaseAdmin
		.from('email_threads')
		.select(
			`
            id, subject, thread_key, last_message_at, last_message_body,
            last_message_direction, unread_count, message_count, contact_id,
            contacts(id, name, company, contact_score)
        `,
			{ count: 'exact' }
		)
		.eq('user_id', ownerId)
		.order('last_message_at', { ascending: false })
		.range(offset, offset + limit - 1);

	const { count: totalUnread } = await supabaseAdmin
		.from('email_threads')
		.select('*', { count: 'exact', head: true })
		.eq('user_id', ownerId)
		.gt('unread_count', 0);

	return json({
		threads: threads ?? [],
		totalUnread: totalUnread ?? 0,
		total: total ?? 0,
		offset,
		limit,
	});
};
