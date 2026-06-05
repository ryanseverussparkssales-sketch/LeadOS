import { json } from '@sveltejs/kit';
import { requireSuperAdmin, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

// Super-admin only: every account on the platform, with plan, signup, last login,
// and team size. Joined in memory from 3 queries (no N+1).
export const GET: RequestHandler = async ({ request }) => {
	await requireSuperAdmin(request);

	const [usersRes, userSettingsRes, membersRes] = await Promise.all([
		supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 }),
		// user_settings is the single source for both display name and tier.
		supabaseAdmin.from('user_settings').select('user_id, agency_name, company_name, subscription_tier'),
		supabaseAdmin.from('team_members').select('owner_user_id, member_user_id, status'),
	]);

	const tierMap = new Map<string, string | null>();
	const nameMap = new Map<string, string | null>();
	for (const s of userSettingsRes.data ?? []) {
		tierMap.set(s.user_id, (s as any).subscription_tier);
		nameMap.set(s.user_id, (s as any).agency_name || (s as any).company_name || null);
	}

	const memberOwnerOf = new Map<string, string>(); // member_user_id -> owner
	const teamSize = new Map<string, number>();       // owner -> active member count
	for (const m of membersRes.data ?? []) {
		if (m.member_user_id && m.status === 'active') memberOwnerOf.set(m.member_user_id, m.owner_user_id);
		if (m.status === 'active') teamSize.set(m.owner_user_id, (teamSize.get(m.owner_user_id) ?? 0) + 1);
	}

	const accounts = (usersRes.data?.users ?? []).map((u) => {
		return {
			id: u.id,
			email: u.email ?? null,
			created_at: u.created_at,
			last_sign_in_at: u.last_sign_in_at ?? null,
			agency_name: nameMap.get(u.id) ?? null,
			tier: (tierMap.get(u.id) as string) ?? 'free',
			is_team_member: memberOwnerOf.has(u.id),
			owner_user_id: memberOwnerOf.get(u.id) ?? null,
			team_size: teamSize.get(u.id) ?? 0,
		};
	});

	// Owners (agency accounts) first, then team members.
	accounts.sort((a, b) => Number(a.is_team_member) - Number(b.is_team_member));

	return json({ accounts });
};
