/**
 * Voyage AI embeddings + per-call embedding storage for semantic search.
 *
 * Model: voyage-3.5 @ 1024 dims (matches the VECTOR(1024) column in
 * supabase/migrations/0004_semantic_search_calls.sql). Requires VOYAGE_API_KEY.
 *
 * input_type matters for retrieval quality: store documents with 'document',
 * embed the user's search string with 'query'.
 */
import { createHash } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from './supabase';

export const EMBED_MODEL = 'voyage-3.5';
export const EMBED_DIMS = 1024;

/** Embed one or more strings. Returns one vector per input, or null on failure. */
export async function embedTexts(
	texts: string[],
	inputType: 'document' | 'query'
): Promise<number[][] | null> {
	if (!env.VOYAGE_API_KEY) {
		console.warn('[embeddings] VOYAGE_API_KEY not set — semantic features disabled');
		return null;
	}
	if (!texts.length) return [];
	try {
		const res = await fetch('https://api.voyageai.com/v1/embeddings', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				input: texts,
				model: EMBED_MODEL,
				input_type: inputType,
				output_dimension: EMBED_DIMS,
			}),
		});
		if (!res.ok) {
			console.error('[embeddings] Voyage error', res.status, await res.text().catch(() => ''));
			return null;
		}
		const data = (await res.json()) as { data: Array<{ embedding: number[]; index: number }> };
		// Preserve input order
		return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
	} catch (e) {
		console.error('[embeddings] Voyage fetch failed:', e instanceof Error ? e.message : e);
		return null;
	}
}

export async function embedQuery(text: string): Promise<number[] | null> {
	const out = await embedTexts([text], 'query');
	return out?.[0] ?? null;
}

/** Build the searchable text for a call from its summary/transcript/outcome. */
function callText(c: {
	summary: string | null;
	raw_transcript: string | null;
	outcome: string | null;
	notes: string | null;
}): string {
	return [
		c.summary && `Summary: ${c.summary}`,
		c.outcome && `Outcome: ${c.outcome}`,
		c.notes && `Notes: ${c.notes}`,
		c.raw_transcript && `Transcript: ${c.raw_transcript}`,
	]
		.filter(Boolean)
		.join('\n')
		// Voyage handles long inputs, but cap to keep token cost bounded.
		.slice(0, 16000);
}

/**
 * Embed a single call and upsert into call_embeddings. Skips work when the
 * content hasn't changed (content_hash). Non-fatal: never throws to callers.
 * Returns true if an embedding was (re)written.
 */
export async function embedCall(callId: string): Promise<boolean> {
	try {
		const { data: call } = await supabaseAdmin
			.from('calls')
			.select('id, user_id, summary, raw_transcript, outcome, notes')
			.eq('id', callId)
			.single();
		if (!call?.user_id) return false;

		const text = callText(call);
		if (!text.trim()) return false; // nothing meaningful to embed yet

		const hash = createHash('sha256').update(`${EMBED_MODEL}:${text}`).digest('hex');
		const { data: existing } = await supabaseAdmin
			.from('call_embeddings')
			.select('content_hash')
			.eq('call_id', callId)
			.maybeSingle();
		if (existing?.content_hash === hash) return false; // unchanged

		const vectors = await embedTexts([text], 'document');
		const embedding = vectors?.[0];
		if (!embedding) return false;

		const { error } = await supabaseAdmin.from('call_embeddings').upsert(
			{
				call_id: callId,
				user_id: call.user_id,
				content_hash: hash,
				embedding: embedding as unknown as string, // pgvector accepts JSON array
				updated_at: new Date().toISOString(),
			},
			{ onConflict: 'call_id' }
		);
		if (error) {
			console.error('[embeddings] upsert failed:', error.message);
			return false;
		}
		return true;
	} catch (e) {
		console.error('[embeddings] embedCall failed:', e instanceof Error ? e.message : e);
		return false;
	}
}

/** Semantic search over a user's calls. Returns [{ call_id, similarity }]. */
export async function searchCalls(
	userId: string,
	query: string,
	limit = 10
): Promise<Array<{ call_id: string; similarity: number }>> {
	const qv = await embedQuery(query);
	if (!qv) return [];
	const { data, error } = await supabaseAdmin.rpc('match_calls', {
		query_embedding: qv as unknown as string,
		p_user_id: userId,
		match_count: Math.min(Math.max(limit, 1), 50),
	});
	if (error) {
		console.error('[embeddings] match_calls failed:', error.message);
		return [];
	}
	return (data ?? []) as Array<{ call_id: string; similarity: number }>;
}
