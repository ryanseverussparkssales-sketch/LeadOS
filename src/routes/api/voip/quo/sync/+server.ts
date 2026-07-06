/**
 * Quo (OpenPhone) manual sync.
 *
 * POST /api/voip/quo/sync
 *
 * Authenticated. Pulls recent calls from the Quo REST API for the configured
 * phone number and upserts them into public.calls for the CALLER's effective
 * owner (owner-scoped). Any call that has a recording but no transcript yet is
 * transcribed (fire path awaited so the counts are accurate). Rate-limited.
 *
 * Returns { synced, transcribed }.
 * 400 when QUO_API_KEY / QUO_PHONE_NUMBER_ID are unset.
 */

import { json, error } from '@sveltejs/kit';
import { requireAuth, getEffectiveUserId } from '$lib/server/supabase';
import { rateLimitUser } from '$lib/server/rateLimit';
import {
	quoApiKey,
	quoPhoneNumberId,
	fetchQuoCalls,
	upsertQuoCall,
	transcribeQuoCall,
} from '$lib/server/quo';

export const POST = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	// Rate limit: this hits a third-party API + Groq/Claude, so keep it modest.
	const blocked = await rateLimitUser(ownerId, { max: 10, windowMs: 60_000 });
	if (blocked) throw error(429, 'Too many sync requests — try again shortly');

	if (!quoApiKey()) throw error(400, 'QUO_API_KEY not configured');
	if (!quoPhoneNumberId()) throw error(400, 'QUO_PHONE_NUMBER_ID not configured');

	const calls = await fetchQuoCalls(50);

	let synced = 0;
	let transcribed = 0;

	for (const call of calls) {
		if (!call?.id) continue;
		try {
			const { rowId, recordingUrl, hasTranscript } = await upsertQuoCall(ownerId, call);
			if (rowId) synced += 1;
			if (rowId && recordingUrl && !hasTranscript) {
				await transcribeQuoCall(rowId, recordingUrl, ownerId);
				transcribed += 1;
			}
		} catch (err) {
			console.error('[quo/sync] call upsert error:', err instanceof Error ? err.message : err);
		}
	}

	return json({ synced, transcribed });
};
