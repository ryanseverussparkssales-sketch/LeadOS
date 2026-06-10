import { json, error } from '@sveltejs/kit';
import { requireSuperAdmin, supabaseAdmin } from '$lib/server/supabase';
import { logAdminAction } from '$lib/server/audit';
import type { RequestHandler } from './$types';

// Super-admin only: provision a new account.
//   - agency → a new agency owner (their own workspace + tier)
//   - rep    → a team member under an existing agency (owner_user_id)
//   - admin  → a platform admin (agency-tier workspace + platform_admins row)
export const POST: RequestHandler = async ({ request }) => {
	const admin = await requireSuperAdmin(request);

	const { type, email, password, name, agencyName, ownerUserId, tier } = await request.json() as {
		type: 'agency' | 'rep' | 'admin';
		email?: string; password?: string; name?: string; agencyName?: string;
		ownerUserId?: string; tier?: string;
	};

	if (!email || !password) throw error(400, 'email and password are required');
	if (!['agency', 'rep', 'admin'].includes(type)) throw error(400, 'type must be agency | rep | admin');
	if (password.length < 8) throw error(400, 'password must be at least 8 characters');
	if (type === 'rep' && !ownerUserId) throw error(400, 'a rep needs an agency (ownerUserId)');

	// Create the auth user (email pre-confirmed so they can log in immediately).
	const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
		email: email.trim().toLowerCase(),
		password,
		email_confirm: true,
		user_metadata: { full_name: name ?? null, created_by: 'platform_admin' },
	});
	if (createErr || !created?.user) throw error(400, createErr?.message ?? 'Could not create user');
	const newId = created.user.id;

	try {
		if (type === 'agency' || type === 'admin') {
			await supabaseAdmin.from('user_settings').upsert({
				user_id: newId,
				agency_name: agencyName || name || email,
				company_name: name || null,
				company_email: email,
				subscription_tier: type === 'admin' ? 'agency' : (tier && ['free', 'pro', 'agency'].includes(tier) ? tier : 'agency'),
				updated_at: new Date().toISOString(),
			}, { onConflict: 'user_id' });
		}

		if (type === 'admin') {
			await supabaseAdmin.from('platform_admins').insert({ user_id: newId });
		}

		if (type === 'rep') {
			await supabaseAdmin.from('team_members').insert({
				owner_user_id: ownerUserId,
				member_user_id: newId,
				member_email: email.trim().toLowerCase(),
				role: 'agent',
				status: 'active',
			});
		}
	} catch (e) {
		// Roll back the auth user if the follow-on records failed, so we don't orphan a login.
		await supabaseAdmin.auth.admin.deleteUser(newId).catch(() => {});
		throw error(500, e instanceof Error ? e.message : 'Could not finish account setup');
	}

	await logAdminAction({
		adminUserId: admin.id, adminEmail: admin.email,
		action: 'create_account', targetUserId: newId, targetEmail: email,
		detail: { type, tier: tier ?? null, ownerUserId: ownerUserId ?? null },
	});
	return json({ success: true, id: newId, email, type });
};
