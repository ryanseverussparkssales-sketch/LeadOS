import { json, error } from '@sveltejs/kit';
import { requireSuperAdmin, supabaseAdmin } from '$lib/server/supabase';
import { logAdminAction, getOverride } from '$lib/server/audit';
import type { RequestHandler } from './$types';

// PATCH /api/admin/accounts/[id]/overrides
// Body (any subset): { ai_access: 'on'|'off'|null, trial_ends_at, rate_limit_multiplier, feature_flags, notes }
export const PATCH: RequestHandler = async ({ request, params }) => {
	const admin = await requireSuperAdmin(request);
	const id = params.id;
	const body = (await request.json()) as Record<string, unknown>;

	const before = await getOverride(id);

	const patch: Record<string, unknown> = { user_id: id, updated_at: new Date().toISOString(), updated_by: admin.id };
	if ('ai_access' in body) {
		const v = body.ai_access;
		if (v !== 'on' && v !== 'off' && v !== null) throw error(400, "ai_access must be 'on', 'off', or null");
		patch.ai_access = v;
	}
	if ('trial_ends_at' in body) patch.trial_ends_at = body.trial_ends_at ?? null;
	if ('rate_limit_multiplier' in body) {
		const n = Number(body.rate_limit_multiplier);
		if (!Number.isFinite(n) || n <= 0) throw error(400, 'rate_limit_multiplier must be a positive number');
		patch.rate_limit_multiplier = n;
	}
	if ('feature_flags' in body && typeof body.feature_flags === 'object') patch.feature_flags = body.feature_flags;
	if ('notes' in body) patch.notes = body.notes ?? null;

	const { data, error: e } = await supabaseAdmin
		.from('account_overrides')
		.upsert(patch, { onConflict: 'user_id' })
		.select()
		.single();
	if (e) throw error(500, e.message);

	const { data: target } = await supabaseAdmin.auth.admin.getUserById(id);
	await logAdminAction({
		adminUserId: admin.id, adminEmail: admin.email,
		action: 'override_update', targetUserId: id, targetEmail: target?.user?.email ?? null,
		detail: { before, after: data },
	});
	return json({ ok: true, override: data });
};
