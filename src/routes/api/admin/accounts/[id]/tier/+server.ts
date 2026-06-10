import { json, error } from '@sveltejs/kit';
import { requireSuperAdmin, supabaseAdmin } from '$lib/server/supabase';
import { logAdminAction } from '$lib/server/audit';
import type { RequestHandler } from './$types';

// Super-admin only: set an account's subscription tier.
export const PATCH: RequestHandler = async ({ request, params }) => {
	const admin = await requireSuperAdmin(request);
	const { tier } = await request.json();
	if (!['free', 'pro', 'agency'].includes(tier)) throw error(400, 'tier must be free | pro | agency');

	const { data: prev } = await supabaseAdmin
		.from('user_settings').select('subscription_tier').eq('user_id', params.id).maybeSingle();

	const { error: e } = await supabaseAdmin
		.from('user_settings')
		.upsert(
			{ user_id: params.id, subscription_tier: tier, updated_at: new Date().toISOString() },
			{ onConflict: 'user_id' }
		);
	if (e) throw error(500, e.message);

	await logAdminAction({
		adminUserId: admin.id, adminEmail: admin.email,
		action: 'tier_change', targetUserId: params.id,
		detail: { from: prev?.subscription_tier ?? 'free', to: tier },
	});
	return json({ success: true, tier });
};
