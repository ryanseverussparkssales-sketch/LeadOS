import { json } from '@sveltejs/kit';
import { requireSuperAdmin, supabaseAdmin } from '$lib/server/supabase';
import { logAdminAction } from '$lib/server/audit';
import type { RequestHandler } from './$types';

// POST /api/admin/accounts/[id]/impersonate — audit-only. The actual impersonation
// is carried by the x-impersonate-owner header (gated in requireAuth); this records
// that an admin started a "View as" session so it shows in the audit trail.
export const POST: RequestHandler = async ({ request, params }) => {
	const admin = await requireSuperAdmin(request);
	const id = params.id;
	const { data: target } = await supabaseAdmin.auth.admin.getUserById(id);
	await logAdminAction({
		adminUserId: admin.id, adminEmail: admin.email,
		action: 'impersonate', targetUserId: id, targetEmail: target?.user?.email ?? null,
	});
	return json({ ok: true });
};
