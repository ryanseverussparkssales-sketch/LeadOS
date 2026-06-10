-- 0004_semantic_search_calls.sql — semantic search over calls (pgvector + Voyage).
-- Embeddings are voyage-3.5 @ 1024 dims. Stored in a dedicated table so the hot
-- `calls` table isn't bloated by a vector column on every SELECT *.
-- Idempotent. Run in the Supabase SQL Editor.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS call_embeddings (
    call_id      UUID PRIMARY KEY REFERENCES calls(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content_hash TEXT,                       -- skip re-embedding identical content
    embedding    VECTOR(1024),
    updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_embeddings_user ON call_embeddings(user_id);
-- Approximate-NN index for cosine distance. HNSW builds fine on an empty table.
CREATE INDEX IF NOT EXISTS idx_call_embeddings_hnsw
    ON call_embeddings USING hnsw (embedding vector_cosine_ops);

ALTER TABLE call_embeddings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS call_embeddings_own ON call_embeddings;
CREATE POLICY call_embeddings_own ON call_embeddings
    FOR ALL USING (user_id = auth.uid());

-- Cosine-similarity search, scoped to the caller's tenant. Returns call ids +
-- similarity (1 = identical). SECURITY DEFINER because it's invoked server-side
-- via the service role; the p_user_id filter enforces isolation.
CREATE OR REPLACE FUNCTION match_calls(
    query_embedding VECTOR(1024),
    p_user_id       UUID,
    match_count     INT DEFAULT 10
)
RETURNS TABLE (call_id UUID, similarity FLOAT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT ce.call_id, 1 - (ce.embedding <=> query_embedding) AS similarity
    FROM call_embeddings ce
    WHERE ce.user_id = p_user_id
      AND ce.embedding IS NOT NULL
    ORDER BY ce.embedding <=> query_embedding
    LIMIT match_count;
$$;

REVOKE ALL ON FUNCTION match_calls(VECTOR, UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION match_calls(VECTOR, UUID, INT) TO service_role;

NOTIFY pgrst, 'reload schema';
