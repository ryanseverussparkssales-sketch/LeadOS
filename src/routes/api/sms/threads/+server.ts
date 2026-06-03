import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const limit = parseInt(url.searchParams.get('limit') ?? '50');

	const { data: threads } = await supabaseAdmin
		.from('sms_threads')
		.select(`
			id, remote_number, local_number, last_message_at,
			last_message_body, last_message_direction, unread_count,
			is_opted_out, contact_id,
			contacts(id, name, company, phone, contact_score),
			recent_intent:sms_logs(intent_label).order(sent_at, { ascending: false }).limit(1)
		`)
		.eq('user_id', ownerId)
		.order('last_message_at', { ascending: false })
		.limit(limit);
	return json({ success: true });
};
