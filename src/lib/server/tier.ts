import { error } from '@sveltejs/kit';
import { supabaseAdmin, getEffectiveUserId } from './supabase';
import { isSuperAdmin } from './superadmin';

export type Tier = 'free' | 'pro' | 'agency';

export const TIER_LIMITS = {
	free:   { contacts: 250, campaigns: 1, ai: false, team: false, clientPortal: false },
	pro:    { contacts: Infinity, campaigns: Infinity, ai: true, team: false, clientPortal: false },
	agency: { contacts: Infinity, campaigns: Infinity, ai: true, team: true, clientPortal: true },
} as const;

export async function getUserTier(userId: string): Promise<Tier> {
	// Platform super-admins are unlimited (treated as the top tier) on their own account.
	if (isSuperAdmin(userId)) return 'agency';

	const { data } = await supabaseAdmin
		.from('user_settings')
		.select('subscription_tier')
		.eq('user_id', userId)
		.maybeSingle();
	const tier = data?.subscription_tier as Tier | null;
	if (tier === 'pro' || tier === 'agency') return tier;
	return 'free';
}

export async function checkLimit(userId: string, feature: keyof typeof TIER_LIMITS.free): Promise<{ allowed: boolean; tier: Tier; limit: number | boolean }> {
	const tier = await getUserTier(userId);
	const limits = TIER_LIMITS[tier];
	const limit = limits[feature];
	return { allowed: !!limit, tier, limit };
}

/**
 * Server-side gate for AI features. Resolves the effective owner (a team member
 * inherits their agency's tier), then throws HTTP 402 when the plan excludes AI.
 * Use at the top of any endpoint whose sole purpose is AI generation so free
 * accounts can't burn model tokens — TIER_LIMITS already declares free.ai = false;
 * this enforces it. Returns the resolved tier on success.
 */
export async function assertAiAccess(userId: string): Promise<Tier> {
	const ownerId = await getEffectiveUserId(userId);
	const tier = await getUserTier(ownerId);
	if (!TIER_LIMITS[tier].ai) {
		throw error(402, 'AI features require a Pro or Agency plan.');
	}
	return tier;
}
