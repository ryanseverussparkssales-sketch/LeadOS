import { json } from '@sveltejs/kit';
import { requireAuth, getEffectiveUserId } from '$lib/server/supabase';
import { getUserTier, TIER_LIMITS } from '$lib/server/tier';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	const tier = await getUserTier(ownerId);
	const limits = TIER_LIMITS[tier];

	return json({
		tier,
		limits,
		features: {
			voicemailDrops:   tier !== 'free',
			aiBrief:          tier !== 'free',
			callRecording:    tier !== 'free',
			multipleNumbers:  tier !== 'free',
			contactDelete:    true,            // everyone can delete
			advancedWidgets:  tier !== 'free',
			sequences:        tier !== 'free',
			clientPortal:     tier === 'agency',
			teamMembers:      tier === 'agency',
			unlimitedContacts: tier !== 'free',
		},
	});
};
