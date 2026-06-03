import { supabaseAdmin } from './supabase';

export type Tier = 'free' | 'pro' | 'agency';

export const TIER_LIMITS = {
	free:   { contacts: 250, campaigns: 1, ai: false, team: false, clientPortal: false },
	pro:    { contacts: Infinity, campaigns: Infinity, ai: true, team: false, clientPortal: false },
	agency: { contacts: Infinity, campaigns: Infinity, ai: true, team: true, clientPortal: true },
} as const;

export async function getUserTier(userId: string): Promise<Tier> {
	const { data } = await supabaseAdmin
		.from('settings')
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
