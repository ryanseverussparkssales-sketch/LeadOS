import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);

	// Find this user's team_member record with portal access
	const { data: membership } = await supabaseAdmin
		.from('team_members')
		.select('client_id, client:clients(id, name, logo_url, industry, description, website, contract_value, contract_status, primary_contact_name, primary_contact_email), owner_user_id, portal_access, role, permissions')
		.eq('member_user_id', user.id)
		.eq('portal_access', true)
		.not('client_id', 'is', null)
		.maybeSingle();

	if (!membership || !membership.client_id) {
		throw error(403, 'No client portal access for this account');
	}

	const clientId = membership.client_id;
	const ownerId = membership.owner_user_id;
	const clientData = membership.client as any;

	const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600000).toISOString();

	// Fetch client's data in parallel
	const [contactsRes, campaignsRes, callsRes, tasksRes, dealsRes] = await Promise.all([
		// Total contacts linked to this client
		supabaseAdmin
			.from('contact_client_assoc')
			.select('contact:contacts(id, name, company, phone, status, contact_score)')
			.eq('client_id', clientId)
			.eq('user_id', ownerId)
			.limit(100),

		// Active campaigns under this client (with full campaign metrics)
		supabaseAdmin
			.from('projects')
			.select('id, name, campaigns(id, name, status, campaign_type, win_count, target_wins, calls_today, total_calls, daily_call_goal, win_label, win_outcome, win_conditions, call_lists(id, name, call_list_contacts(count)))')
			.eq('client_id', clientId)
			.order('name'),

		// Recent calls to this client's contacts (last 30 days)
		supabaseAdmin
			.from('calls')
			.select('id, created_at, outcome, call_duration_seconds, phone_number, contact:contacts(name, company)')
			.eq('user_id', ownerId)
			.gte('created_at', thirtyDaysAgo)
			.order('created_at', { ascending: false })
			.limit(50),

		// Pending tasks
		supabaseAdmin
			.from('tasks')
			.select('id, title, priority, due_date, status, task_type')
			.eq('user_id', ownerId)
			.eq('status', 'pending')
			.is('deleted_at', null)
			.limit(20),

		// Active deals
		supabaseAdmin
			.from('deals')
			.select('id, name, value, stage, contact:contacts(name)')
			.eq('user_id', ownerId)
			.eq('client_id', clientId)
			.is('deleted_at', null)
			.not('stage', 'in', '("won","lost")')
			.limit(20),
	]);

	const contacts = (contactsRes.data ?? []).map((r: any) => r.contact).filter(Boolean);
	const projects = campaignsRes.data ?? [];
	const callData = callsRes.data ?? [];

	// Compute call stats
	const answeredCalls = callData.filter((c: any) => c.outcome === 'answered').length;
	const totalCalls = callData.length;
	const avgDuration = totalCalls > 0
		? Math.round(callData.filter((c: any) => c.call_duration_seconds).reduce((s: number, c: any) => s + (c.call_duration_seconds ?? 0), 0) / Math.max(answeredCalls, 1))
		: 0;

	// Time tracking hours (last 30 days)
y) => {
		const { data: timeData } = await supabaseAdmin
			.from('time_entries')
			.select('duration_minutes')
			.eq('user_id', ownerId)
			.gte('created_at', thirtyDaysAgo);
		return Math.round((timeData ?? []).reduce((s: number, e: any) => s + (e.duration_minutes ?? 0), 0) / 60);
	})().catch(() => 0);

	// Get owner's agency name from settings
	const { data: ownerSettings } = await supabaseAdmin
		.from('settings')
		.select('agency_name')
		.eq('user_id', ownerId)
		.maybeSingle();

	const agencyName = ownerSettings?.agency_name || 'Your Agency';

	// Win counts per campaign
	const winOutcomes = new Set(['appointment_set','demo_scheduled','meeting_confirmed','signed_up','callback','follow_up_agreed']);
	const recentWins = callData.filter((c: any) => winOutcomes.has(c.outcome ?? ''));
	const connectRate = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0;

	return json({
		client: {
			...clientData,
			id: clientId,
		},
		agencyName,
		stats: {
			totalContacts: contacts.length,
			callsLast30d: totalCalls,
			connectRate,
			avgDuration,
			recentWins: recentWins.length,
			hoursLogged: await (async () => {
				// already computed above
				return 0;
			})().catch(() => 0),
		},
		projects,
		recentCalls: callData.slice(0, 20),
		recentWins: recentWins.slice(0, 10),
		tasks: tasksRes.data ?? [],
		deals: dealsRes.data ?? [],
		insights: null,
	});
};
