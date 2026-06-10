import { json, error } from '@sveltejs/kit';
import { requireAuth, supabaseAdmin, getEffectiveUserId } from '$lib/server/supabase';
import { searchCalls } from '$lib/server/embeddings';
import type { RequestHandler } from './$types';

/**
 * POST /api/search/semantic
 * Body: { query: string, limit?: number }
 * Semantic search over the caller's calls (transcripts/summaries) via pgvector.
 * Returns ranked call rows with a similarity score.
 */
export const POST: RequestHandler = async ({ request }) => {
	const user = await requireAuth(request);
	const ownerId = await getEffectiveUserId(user.id);

	const { query, limit } = (await request.json().catch(() => ({}))) as {
		query?: string;
		limit?: number;
	};
	if (!query?.trim()) throw error(400, 'query required');

	const hits = await searchCalls(ownerId, query.trim(), limit ?? 10);
	if (!hits.length) return json({ results: [] });

	// Hydrate the matching calls (preserve similarity order).
	const ids = hits.map((h) => h.call_id);
	const { data: calls } = await supabaseAdmin
		.from('calls')
		.select('id, created_at, outcome, summary, phone_number, call_duration_seconds, contact:contacts(id, name, company)')
		.in('id', ids)
		.eq('user_id', ownerId);

	const byId = new Map((calls ?? []).map((c) => [c.id, c]));
	const results = hits
		.map((h) => {
			const c = byId.get(h.call_id);
			return c ? { ...c, similarity: Number(h.similarity.toFixed(4)) } : null;
		})
		.filter(Boolean);

	return json({ results });
};
