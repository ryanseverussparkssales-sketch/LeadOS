import { json } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);

	const { data: membership } = await supabaseAdmin
		.from('team_members')
		.select('id, role, owner_user_id, portal_access, client_id, permissions, verbal_approved_at')
		.eq('member_user_id', user.id)
		.eq('role', 'sdr')
		.not('portal_access', 'is', true)
		.maybeSingle();

	if (!membership) return json({ isSdr: false });

	// Merge with defaults so missing keys default to ON
	const defaults = {
		coaching: true,
		interview: true,
		profile: true,
		marketplace: true,
		bonus_visible: true,
		performance: true,
		dossier: true,
		scripts: true,
		callbacks: true,
		messages: true,
	};
	const permissions = { ...defaults, ...((membership.permissions ?? {}) as Record<string,boolean>) };

	return json({
		isSdr: true,
		role: membership.role,
		ownerId: membership.owner_user_id,
		membershipId: membership.id,
		verbal_approved_at: (membership as any).verbal_approved_at ?? null,
		permissions,
	});
};
