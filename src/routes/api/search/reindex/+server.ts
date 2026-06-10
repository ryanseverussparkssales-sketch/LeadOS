import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import { embedCall } from '$lib/server/embeddings';
import type { RequestHandler } from './$types';

const BATCH = 25; // cap per invocation to stay within the serverless timeout

/**
 * POST /api/search/reindex  — backfill call embeddings.
 * Auth: CRON_SECRET (server/cron, all tenants) OR a user JWT (that user only).
 * Embeds up to BATCH calls that have content but no up-to-date embedding, then
 * reports how many remain so it can be called repeatedly until drained.
 */
async function reindex(scopeUserId: string | null) {
	// Calls with searchable content
	let q = supabaseAdmin
		.from('calls')
		.select('id')
		.or('summary.not.is.null,raw_transcript.not.is.null')
		.order('created_at', { ascending: false })
		.limit(500);
	if (scopeUserId) q = q.eq('user_id', scopeUserId);
	const { data: calls } = await q;
	const candidateIds = (calls ?? []).map((c) => c.id);
	if (!candidateIds.length) return json({ embedded: 0, remaining: 0 });

	// Which already have an embedding row
	const { data: done } = await supabaseAdmin
		.from('call_embeddings')
		.select('call_id')
		.in('call_id', candidateIds);
	const haveEmbedding = new Set((done ?? []).map((d) => d.call_id));
	const todo = candidateIds.filter((id) => !haveEmbedding.has(id));

	let embedded = 0;
	for (const id of todo.slice(0, BATCH)) {
		if (await embedCall(id)) embedded++;
	}
	return json({ embedded, remaining: Math.max(0, todo.length - embedded) });
}

export const POST: RequestHandler = async ({ request }) => {
	const authHeader = request.headers.get('authorization') ?? '';
	if (env.CRON_SECRET && authHeader === `Bearer ${env.CRON_SECRET}`) {
		return reindex(null); // cron: all tenants
	}
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);
	return reindex(ownerId);
};

// Allow Vercel cron (GET) to drive periodic backfill too.
export const GET: RequestHandler = async ({ request }) => {
	const authHeader = request.headers.get('authorization') ?? '';
	if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	return reindex(null);
};
