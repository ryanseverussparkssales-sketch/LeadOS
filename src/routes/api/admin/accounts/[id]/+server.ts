import { json, error } from '@sveltejs/kit';
import { requireSuperAdmin, supabaseAdmin } from '$lib/server/supabase';
import { logAdminAction, getOverride } from '$lib/server/audit';
import type { RequestHandler } from './$types';

// GET /api/admin/accounts/[id] — full drill-down for one account.
export const GET: RequestHandler = async ({ request, params }) => {
	await requireSuperAdmin(request);
	const id = params.id;

	const [userRes, settingsRes, teamRes, numbersRes, override] = await Promise.all([
		supabaseAdmin.auth.admin.getUserById(id),
		supabaseAdmin.from('user_settings').select('agency_name, company_name, company_email, subscription_tier, created_at').eq('user_id', id).maybeSingle(),
		supabaseAdmin.from('team_members').select('id, member_email, member_user_id, role, status, created_at:invited_at').eq('owner_user_id', id),
		supabaseAdmin.from('phone_numbers').select('id, phone_number, friendly_name, status, assigned_user_id').eq('user_id', id),
		getOverride(id),
	]);

	if (userRes.error || !userRes.data?.user) throw error(404, 'Account not found');
	const u = userRes.data.user;

	// Usage rollups (counts via head:true; cost summed from a bounded window).
	const [contactsC, callsC, calls30C, usageRes, recentCallsRes] = await Promise.all([
		supabaseAdmin.from('contacts').select('id', { count: 'exact', head: true }).eq('user_id', id),
		supabaseAdmin.from('calls').select('id', { count: 'exact', head: true }).eq('user_id', id),
		supabaseAdmin.from('calls').select('id', { count: 'exact', head: true }).eq('user_id', id)
			.gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
		supabaseAdmin.from('api_usage_log').select('total_cost, claude_cost, twilio_cost, groq_cost').eq('user_id', id).limit(5000),
		supabaseAdmin.from('calls').select('id, created_at, outcome, summary, call_duration_seconds').eq('user_id', id)
			.order('created_at', { ascending: false }).limit(5),
	]);

	const spend = (usageRes.data ?? []).reduce(
		(a, r) => ({
			total: a.total + (r.total_cost ?? 0),
			claude: a.claude + (r.claude_cost ?? 0),
			twilio: a.twilio + (r.twilio_cost ?? 0),
			groq: a.groq + (r.groq_cost ?? 0),
		}),
		{ total: 0, claude: 0, twilio: 0, groq: 0 }
	);

	return json({
		id: u.id,
		email: u.email ?? null,
		created_at: u.created_at,
		last_sign_in_at: u.last_sign_in_at ?? null,
		email_confirmed_at: u.email_confirmed_at ?? null,
		agency_name: (settingsRes.data as any)?.agency_name ?? (settingsRes.data as any)?.company_name ?? null,
		tier: (settingsRes.data as any)?.subscription_tier ?? 'free',
		team: teamRes.data ?? [],
		numbers: numbersRes.data ?? [],
		override,
		usage: {
			contacts: contactsC.count ?? 0,
			calls: callsC.count ?? 0,
			calls30d: calls30C.count ?? 0,
			spend,
		},
		recentCalls: recentCallsRes.data ?? [],
	});
};

// DELETE /api/admin/accounts/[id] — offboard a tenant (deletes the auth user;
// app data cascades via FKs). Irreversible — heavily audited.
export const DELETE: RequestHandler = async ({ request, params }) => {
	const admin = await requireSuperAdmin(request);
	const id = params.id;
	if (id === admin.id) throw error(400, 'You cannot offboard your own account');

	const { data: target } = await supabaseAdmin.auth.admin.getUserById(id);
	const targetEmail = target?.user?.email ?? null;

	const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(id);
	if (delErr) throw error(500, delErr.message);

	await logAdminAction({
		adminUserId: admin.id, adminEmail: admin.email,
		action: 'offboard', targetUserId: id, targetEmail,
		detail: { note: 'auth user deleted; data cascaded' },
	});
	return json({ ok: true });
};
