import { json, error } from '@sveltejs/kit';
import { requireSuperAdmin, supabaseAdmin } from '$lib/server/supabase';
import { logAdminAction } from '$lib/server/audit';
import type { RequestHandler } from './$types';

// POST /api/admin/accounts/[id]/suspend  Body: { suspended: boolean, reason?: string }
// Suspended accounts are blocked at the app shell (/api/account/state). Suspending
// an agency owner also blocks its reps (resolved via team_members).
export const POST: RequestHandler = async ({ request, params }) => {
	const admin = await requireSuperAdmin(request);
	const id = params.id;
	if (id === admin.id) throw error(400, 'You cannot suspend your own account');

	const { suspended, reason } = (await request.json()) as { suspended?: boolean; reason?: string };
	const on = !!suspended;

	const { data: target } = await supabaseAdmin.auth.admin.getUserById(id);

	const { error: e } = await supabaseAdmin.from('account_overrides').upsert(
		{
			user_id: id,
			suspended: on,
			suspended_reason: on ? reason ?? null : null,
			suspended_at: on ? new Date().toISOString() : null,
			updated_at: new Date().toISOString(),
			updated_by: admin.id,
		},
		{ onConflict: 'user_id' }
	);
	if (e) throw error(500, e.message);

	await logAdminAction({
		adminUserId: admin.id, adminEmail: admin.email,
		action: on ? 'suspend' : 'reactivate',
		targetUserId: id, targetEmail: target?.user?.email ?? null,
		detail: { reason: reason ?? null },
	});
	return json({ ok: true, suspended: on });
};
