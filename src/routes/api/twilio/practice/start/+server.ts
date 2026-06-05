import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import { getUserTier } from '$lib/server/tier';
import { getTwilioCreds, clientIdentityForUser } from '$lib/server/twilio';
import { env } from '$env/dynamic/private';
import twilio from 'twilio';
import type { RequestHandler } from './$types';

/**
 * Find (or create) the synthetic "AI Practice" contact for this owner. Practice
 * calls are logged against it because `calls.contact_id` is NOT NULL but a practice
 * session has no real prospect. Keyed by phone_normalized='__practice__'.
 */
async function getOrCreatePracticeContact(ownerId: string): Promise<string | null> {
	const SENTINEL = '__practice__';
	const { data: existing } = await supabaseAdmin
		.from('contacts').select('id')
		.eq('user_id', ownerId).eq('phone_normalized', SENTINEL).maybeSingle();
	if (existing) return existing.id;

	const { data: created, error: err } = await supabaseAdmin
		.from('contacts').insert({
			user_id: ownerId,
			name: '🎯 AI Practice',
			phone_normalized: SENTINEL,
			status: 'active',
			contact_type: 'lead',
			lead_source: 'practice',
		}).select('id').single();
	if (err) { console.error('[practice/start] practice contact:', err.message); return null; }
	return created?.id ?? null;
}

/**
 * Start an AI practice call. The rep practices their pitch against an AI buyer
 * persona (the ConversationRelay agent runs in `mode=practice`). We place a call
 * to the rep's own browser client; they answer and pitch the AI.
 *
 * Gated two ways:
 *  - global toggle:  PRACTICE_CALLS_ENABLED=true   (operator master switch)
 *  - price gate:     tier must be pro/agency       (free tier blocked, 402)
 */
export const POST: RequestHandler = async ({ request, url }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	if (env.PRACTICE_CALLS_ENABLED !== 'true') throw error(503, 'AI practice calls are not enabled.');

	const tier = await getUserTier(ownerId);
	if (tier === 'free') throw error(402, 'AI practice calls require a Pro plan.');

	const creds = await getTwilioCreds(user.id);
	if (!creds.hasRest) throw error(503, 'Twilio not configured.');
	if (!env.RELAY_WS_URL) throw error(503, 'ConversationRelay WS server not configured (RELAY_WS_URL).');

	const { persona, from } = await request.json() as { persona?: string; from?: string };
	const personaId = (persona || 'default').replace(/[^a-z_]/gi, '').slice(0, 40) || 'default';
	const identity = clientIdentityForUser(user.id);
	const fromNumber = from || creds.phoneNumber;
	if (!fromNumber) throw error(400, 'No "from" number available.');

	// Practice calls attach to a per-user synthetic contact (calls.contact_id is NOT NULL).
	const practiceContactId = await getOrCreatePracticeContact(ownerId);

	// Log the practice call (non-fatal — proceed even if the row can't be created).
	let callId: string | null = null;
	if (practiceContactId) {
		const { data: call, error: callErr } = await supabaseAdmin
			.from('calls')
			.insert({
				user_id: ownerId,
				contact_id: practiceContactId,
				call_type: 'practice',
				direction: 'outbound',
				phone_number: `practice:${personaId}`,
				started_at: new Date().toISOString(),
			})
			.select('id')
			.single();
		if (callErr) console.error('[practice/start] call row:', callErr.message);
		else callId = call?.id ?? null;
	}

	const twimlUrl = `${url.origin}/api/twilio/conversation-relay` +
		`?mode=practice&persona=${encodeURIComponent(personaId)}&callId=${callId ?? ''}`;

	const client = twilio(creds.accountSid, creds.authToken);
	try {
		const created = await client.calls.create({
			to: `client:${identity}`,
			from: fromNumber,
			url: twimlUrl,
			method: 'POST',
		});
		if (callId) await supabaseAdmin.from('calls').update({ twilio_call_sid: created.sid }).eq('id', callId);
		return json({ call_id: callId, call_sid: created.sid, persona: personaId }, { status: 201 });
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Failed to start practice call';
		if (callId) await supabaseAdmin.from('calls').update({ outcome: 'failed', summary: msg }).eq('id', callId);
		throw error(502, msg);
	}
};
