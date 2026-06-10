import { json, error } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import { requireSuperAdmin, supabaseAdmin } from '$lib/server/supabase';
import { logAdminAction } from '$lib/server/audit';
import type { RequestHandler } from './$types';

// POST /api/admin/accounts/[id]/logout — revoke all of the account's sessions
// via the GoTrue admin endpoint (best-effort; suspension is the hard control).
export const POST: RequestHandler = async ({ request, params }) => {
	const admin = await requireSuperAdmin(request);
	const id = params.id;

	const { data: target } = await supabaseAdmin.auth.admin.getUserById(id);

	let revoked = false;
	try {
		const res = await fetch(`${PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${id}/logout`, {
			method: 'POST',
			headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
		});
		revoked = res.ok;
	} catch (e) {
		console.error('[admin/logout] revoke failed:', e instanceof Error ? e.message : e);
	}

	await logAdminAction({
		adminUserId: admin.id, adminEmail: admin.email,
		action: 'force_logout', targetUserId: id, targetEmail: target?.user?.email ?? null,
		detail: { revoked },
	});
	return json({ ok: true, revoked });
};
