-- Rate limiting table + RPC for DB-backed rate limiting
-- Run once in the Supabase SQL editor.
-- Replaces the non-functional in-memory Map in lib/server/rateLimit.ts.

-- ── Table ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limit_counters (
    key TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    count INTEGER DEFAULT 1,
    window_start TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_expires ON rate_limit_counters(expires_at);
CREATE INDEX IF NOT EXISTS idx_rate_limits_user ON rate_limit_counters(user_id);

-- RLS: users can only see their own rows (admin bypass handled by SECURITY DEFINER on the RPC)
ALTER TABLE rate_limit_counters ENABLE ROW LEVEL SECURITY;

-- Drop policy if it already exists so re-running the script is safe
DROP POLICY IF EXISTS "rate_limit_own" ON rate_limit_counters;
CREATE POLICY "rate_limit_own" ON rate_limit_counters
    FOR ALL USING (user_id = auth.uid());

-- ── Atomic increment RPC ──────────────────────────────────────────────────────
-- Returns the new count after incrementing.
-- If the window has expired, resets the counter to 1 first.
CREATE OR REPLACE FUNCTION increment_rate_limit(
    p_key TEXT,
    p_window_ms BIGINT,
    p_user_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER;
    v_expires TIMESTAMPTZ := NOW() + (p_window_ms || ' milliseconds')::INTERVAL;
BEGIN
    INSERT INTO rate_limit_counters (key, user_id, count, expires_at)
    VALUES (p_key, p_user_id, 1, v_expires)
    ON CONFLICT (key) DO UPDATE
        SET count = CASE
            WHEN rate_limit_counters.expires_at < NOW() THEN 1  -- window expired, reset
            ELSE rate_limit_counters.count + 1                   -- still in window, increment
        END,
        expires_at = CASE
            WHEN rate_limit_counters.expires_at < NOW() THEN v_expires
            ELSE rate_limit_counters.expires_at
        END
    RETURNING count INTO v_count;

    RETURN v_count;
END;
$$;

-- ── Cleanup function (called by daily cron via cleanup_rate_limits RPC) ───────
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
    DELETE FROM rate_limit_counters WHERE expires_at < NOW() - INTERVAL '1 hour';
$$;
