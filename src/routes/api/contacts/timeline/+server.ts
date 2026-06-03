import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const contactId = url.searchParams.get('contact_id');
	if (!contactId) return json([]);

	// Verify access
	const { data: contact } = await supabaseAdmin.from('contacts').select('id').eq('id', contactId).eq('user_id', user.id).maybeSingle();
	if (!contact) return json([]);

	// Fetch all activity types in parallel
	const [calls, sms, emails, tasks, deals, activities] = await Promise.all([
		supabaseAdmin.from('calls').select('id, created_at, outcome, summary, notes, call_duration_seconds, quality_score, recording_url').eq('contact_id', contactId).order('created_at', { ascending: false }).limit(50),
		supabaseAdmin.from('sms_logs').select('id, sent_at, body, direction, status').eq('contact_id', contactId).order('sent_at', { ascending: false }).limit(50),
		supabaseAdmin.from('email_logs').select('id, created_at, subject, body, status, email_type, generated_by, direction, from_address, to_address').eq('contact_id', contactId).order('created_at', { ascending: false }).limit(20),
		supabaseAdmin.from('tasks').select('id, created_at, title, task_type, status, due_date, priority, completed_at').eq('contact_id', contactId).order('created_at', { ascending: false }).limit(30),
		supabaseAdmin.from('deals').select('id, created_at, title, stage, value').eq('contact_id', contactId).order('created_at', { ascending: false }).limit(10),
		supabaseAdmin.from('contact_activities').select('id, created_at, activity_type, title, description, outcome, duration_minutes, scheduled_at').eq('contact_id', contactId).order('scheduled_at', { ascending: false }).limit(50),
	]);

	// Merge into unified timeline
	const events: Array<{type:string; timestamp:string; data:Record<string,unknown>}> = [];

	for (const c of calls.data ?? []) events.push({ type: 'call', timestamp: c.created_at, data: c });
	for (const s of sms.data ?? []) events.push({ type: 'sms', timestamp: s.sent_at, data: s });
	for (const e of emails.data ?? []) events.push({ type: 'email', timestamp: e.created_at, data: e });
	for (const t of tasks.data ?? []) events.push({ type: 'task', timestamp: t.created_at, data: t });
	for (const d of deals.data ?? []) events.push({ type: 'deal', timestamp: d.created_at, data: d });
	for (const a of activities.data ?? []) events.push({ type: 'activity', timestamp: a.scheduled_at ?? a.created_at, data: a });
	return json({ success: true });
};
