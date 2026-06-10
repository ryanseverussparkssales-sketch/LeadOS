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

// DELETE /api/admin/accounts/[id] — offboard a tenant.
// NOTE: this is an *internal* offboard, NOT a hard auth-user delete. Most app
// tables reference auth.users WITHOUT ON DELETE CASCADE, so deleteUser() would
// fail on a FK violation for any account that has data. Instead we permanently
// suspend (blocks the app shell) + revoke sessions. Reversible via reactivate,
// and the account's data is preserved for export/compliance.
export const DELETE: RequestHandler = async ({ request, params }) => {
	const admin = await requireSuperAdmin(request);
	const id = params.id;
	if (id === admin.id) throw error(400, 'You cannot offboard your own account');

	const { data: target } = await supabaseAdmin.auth.admin.getUserById(id);
	const targetEmail = target?.user?.email ?? null;

	const { error: e } = await supabaseAdmin.from('account_overrides').upsert(
		{
			user_id: id,
			suspended: true,
			suspended_reason: 'Offboarded',
			suspended_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			updated_by: admin.id,
		},
		{ onConflict: 'user_id' }
	);
	if (e) throw error(500, e.message);

	// Best-effort: revoke active sessions so they're locked out immediately.
	try {
		const { PUBLIC_SUPABASE_URL } = await import('$env/static/public');
		const { SUPABASE_SERVICE_KEY } = await import('$env/static/private');
		await fetch(`${PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${id}/logout`, {
			method: 'POST',
			headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
		});
	} catch { /* non-fatal */ }

	await logAdminAction({
		adminUserId: admin.id, adminEmail: admin.email,
		action: 'offboard', targetUserId: id, targetEmail,
		detail: { method: 'internal_suspend', note: 'permanently suspended + sessions revoked; data preserved' },
	});
	return json({ ok: true });
};
