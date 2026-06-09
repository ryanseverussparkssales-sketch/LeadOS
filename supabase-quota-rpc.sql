-- Atomic quota increment — replaces the read-modify-write in lib/server/quotas.ts.
-- Concurrent calls were clobbering each other's increments (quota under-counting).
-- Run in: Supabase SQL Editor. Idempotent (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION increment_quota(p_quota_id uuid, p_amount numeric)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE quotas
     SET current_value = COALESCE(current_value, 0) + p_amount,
         updated_at = now()
   WHERE id = p_quota_id;
$$;

-- Only the service role (used by supabaseAdmin server-side) needs to call this.
REVOKE ALL ON FUNCTION increment_quota(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_quota(uuid, numeric) TO service_role;

NOTIFY pgrst, 'reload schema';
