import { json } from '@sveltejs/kit';
import { requireSuperAdmin, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// Super-admin only: platform-wide totals across all accounts.
export const GET: RequestHandler = async ({ request }) => {
	await requireSuperAdmin(request);

	const since30 = new Date(Date.now() - 30 * 86400000).toISOString();

	const [accountsCount, tiers, contacts, calls, callsRecent, teamMembers] = await Promise.all([
		supabaseAdmin.from('user_settings').select('user_id', { count: 'exact', head: true }),
		supabaseAdmin.from('user_settings').select('subscription_tier'),
		supabaseAdmin.from('contacts').select('id', { count: 'exact', head: true }),
		supabaseAdmin.from('calls').select('id', { count: 'exact', head: true }),
		supabaseAdmin.from('calls').select('id', { count: 'exact', head: true }).gte('created_at', since30),
		supabaseAdmin.from('team_members').select('id', { count: 'exact', head: true }).eq('status', 'active'),
	]);

	const byTier = { free: 0, pro: 0, agency: 0 } as Record<string, number>;
	for (const t of tiers.data ?? []) {
		const k = (t.subscription_tier as string) ?? 'free';
		byTier[k] = (byTier[k] ?? 0) + 1;
	}
	const paidAccounts = (byTier.pro ?? 0) + (byTier.agency ?? 0);

	return json({
		accounts: accountsCount.count ?? 0,
		activeReps: teamMembers.count ?? 0,
		totalContacts: contacts.count ?? 0,
		totalCalls: calls.count ?? 0,
		callsLast30d: callsRecent.count ?? 0,
		byTier,
		paidAccounts,
	});
};
