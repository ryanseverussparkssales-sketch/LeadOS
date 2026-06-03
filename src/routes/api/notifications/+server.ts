import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	const now = new Date().toISOString();
	const since24h = new Date(Date.now() - 24 * 3600000).toISOString();

	// Run all queries in parallel
	const [tasksRes, leadsRes, voicemailsRes, missedRes, unreadSmsRes, unreadEmailRes] = await Promise.all([
		// Overdue tasks
		supabaseAdmin
			.from('tasks')
			.select('id, title, due_date, priority, contact:contacts(name)')
			.eq('user_id', ownerId)
			.lt('due_date', now)
			.eq('status', 'pending')
			.is('deleted_at', null)
			.order('due_date', { ascending: true })
			.limit(10),

		// New leads in last 24h (from webhook/scrape sources) — exclude soft-deleted
		supabaseAdmin
			.from('contacts')
			.select('id, name, company, lead_source, created_at')
			.eq('user_id', ownerId)
			.in('lead_source', ['webhook', 'zapier', 'facebook', 'google', 'web_scrape', 'linkedin', 'website'])
			.gte('created_at', since24h)
			.is('deleted_at', null)
			.order('created_at', { ascending: false })
			.limit(10),

		// Unread voicemails
		supabaseAdmin
			.from('voicemails')
			.select('id, caller_id, received_at')
			.eq('user_id', ownerId)
			.eq('status', 'unread')
			.order('received_at', { ascending: false })
			.limit(5),

		// Unreturned missed calls
		supabaseAdmin
			.from('missed_calls')
			.select('id, caller_id, received_at')
			.eq('user_id', ownerId)
			.eq('returned', false)
			.order('received_at', { ascending: false })
			.limit(5),

		// Unread SMS threads
		supabaseAdmin
			.from('sms_threads')
			.select('id, remote_number, last_message_body, last_message_at, contacts(name)', { count: 'exact' })
			.eq('user_id', ownerId)
			.gt('unread_count', 0)
			.order('last_message_at', { ascending: false })
			.limit(5),

		// Unread email threads
		supabaseAdmin
			.from('email_threads')
			.select('id, subject, last_message_body, last_message_at, contacts(name)', { count: 'exact' })
			.eq('user_id', ownerId)
			.gt('unread_count', 0)
			.order('last_message_at', { ascending: false })
			.limit(5),
	]);

	const overdueTasks = tasksRes.data ?? [];
	const newLeads = leadsRes.data ?? [];
	const unreadVoicemails = voicemailsRes.data ?? [];
	const missedCalls = missedRes.data ?? [];
	const unreadSmsThreads = unreadSmsRes.data ?? [];
	const unreadSmsCount = unreadSmsRes.count ?? 0;
	const unreadEmailThreads = unreadEmailRes.data ?? [];
	const unreadEmailCount = unreadEmailRes.count ?? 0;

	const totalCount = overdueTasks.length + newLeads.length + unreadVoicemails.length + missedCalls.length + unreadSmsCount + unreadEmailCount;

	return json({
		totalCount,
		overdueTasks: { count: overdueTasks.length, items: overdueTasks },
		newLeads:     { count: newLeads.length,     items: newLeads },
		voicemails:   { count: unreadVoicemails.length, items: unreadVoicemails },
		missedCalls:  { count: missedCalls.length,  items: missedCalls },
		unreadSms: {
			count: unreadSmsCount,
			items: unreadSmsThreads.map((t: { id: string; remote_number: string; last_message_body: string | null; last_message_at: string | null; contacts?: { name?: string } | null }) => ({
				type: 'unread_sms',
				title: `SMS from ${(t.contacts as { name?: string } | null)?.name ?? t.remote_number}`,
				body: t.last_message_body?.slice(0, 80),
				href: `/phone?thread=${t.id}`,
				at: t.last_message_at,
			})),
		},
		unreadEmail: {
			count: unreadEmailCount,
			items: unreadEmailThreads.map((t: { id: string; subject: string | null; last_message_body: string | null; last_message_at: string | null; contacts?: { name?: string } | null }) => ({
				type: 'unread_email',
				title: `Email: ${t.subject?.slice(0, 50) ?? '(no subject)'}`,
				body: t.last_message_body?.slice(0, 80),
				href: `/inbox?thread=${t.id}`,
				at: t.last_message_at,
			})),
		},
	});
};
