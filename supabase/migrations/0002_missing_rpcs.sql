-- 0002_missing_rpcs.sql — create 3 RPCs the code calls that never existed in prod.
-- Surfaced by supabase/verify-schema.sql (MISSING FUNCTION x3). Each call site
-- fails open / swallows the error, so these features silently did nothing in prod:
--   * increment_rate_limit / cleanup_rate_limits → rate limiting was OFF (fail-open)
--   * increment_campaign_win_count → campaigns.win_count never incremented
-- Idempotent; safe to re-run. Run in the Supabase SQL Editor.

-- ── Rate limiting: shared counter table (serverless-safe) ─────────────────────
CREATE TABLE IF NOT EXISTS rate_limit_counters (
    key TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    count INTEGER DEFAULT 1,
    window_start TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_expires ON rate_limit_counters(expires_at);
CREATE INDEX IF NOT EXISTS idx_rate_limits_user ON rate_limit_counters(user_id);

ALTER TABLE rate_limit_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rate_limit_own" ON rate_limit_counters;
CREATE POLICY "rate_limit_own" ON rate_limit_counters
    FOR ALL USING (user_id = auth.uid());

-- Atomic increment; resets the counter when the window has expired.
-- Returns the new count. Param names match the .rpc() call in lib/server/rateLimit.ts.
CREATE OR REPLACE FUNCTION increment_rate_limit(
    p_key TEXT,
    p_window_ms BIGINT,
    p_user_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
    v_expires TIMESTAMPTZ := NOW() + (p_window_ms || ' milliseconds')::INTERVAL;
BEGIN
    INSERT INTO rate_limit_counters (key, user_id, count, expires_at)
    VALUES (p_key, p_user_id, 1, v_expires)
    ON CONFLICT (key) DO UPDATE
        SET count = CASE
            WHEN rate_limit_counters.expires_at < NOW() THEN 1
            ELSE rate_limit_counters.count + 1
        END,
        expires_at = CASE
            WHEN rate_limit_counters.expires_at < NOW() THEN v_expires
            ELSE rate_limit_counters.expires_at
        END
    RETURNING count INTO v_count;
    RETURN v_count;
END;
$$;

-- Cleanup of expired counters (called by the daily cron via cleanup_rate_limits RPC).
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    DELETE FROM rate_limit_counters WHERE expires_at < NOW() - INTERVAL '1 hour';
$$;

-- ── Campaign win counter ──────────────────────────────────────────────────────
-- Param name MUST be `campaign_id` to match the .rpc('increment_campaign_win_count',
-- { campaign_id }) call in routes/api/calls/[id]/+server.ts.
CREATE OR REPLACE FUNCTION increment_campaign_win_count(campaign_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE campaigns
       SET win_count = COALESCE(win_count, 0) + 1
     WHERE id = campaign_id;
$$;

-- These are all called server-side via supabaseAdmin (service_role).
REVOKE ALL ON FUNCTION increment_rate_limit(TEXT, BIGINT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION cleanup_rate_limits() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION increment_campaign_win_count(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_rate_limit(TEXT, BIGINT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_rate_limits() TO service_role;
GRANT EXECUTE ON FUNCTION increment_campaign_win_count(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
