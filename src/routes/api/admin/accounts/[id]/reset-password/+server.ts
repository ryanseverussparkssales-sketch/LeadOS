import { json, error } from '@sveltejs/kit';
import { requireSuperAdmin, supabaseAdmin } from '$lib/server/supabase';
import { logAdminAction } from '$lib/server/audit';
import type { RequestHandler } from './$types';

// POST /api/admin/accounts/[id]/reset-password  Body: { password: string }
// Sets a new temporary password for the account. The plaintext is never logged.
export const POST: RequestHandler = async ({ request, params }) => {
	const admin = await requireSuperAdmin(request);
	const id = params.id;
	const { password } = (await request.json()) as { password?: string };
	if (!password || password.length < 8) throw error(400, 'Password must be at least 8 characters');

	const { data: target, error: e } = await supabaseAdmin.auth.admin.updateUserById(id, { password });
	if (e) throw error(500, e.message);

	await logAdminAction({
		adminUserId: admin.id, adminEmail: admin.email,
		action: 'reset_password', targetUserId: id, targetEmail: target?.user?.email ?? null,
		detail: {}, // never store the password
	});
	return json({ ok: true });
};
