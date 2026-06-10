-- 0003_ai_usage_log_generalize.sql
-- Make api_usage_log usable for ALL AI usage, not just call recordings:
--   * call_id was NOT NULL, blocking logging for text/vision endpoints (no call).
--   * add `source` (which feature) and `model` (which model) for real per-tenant,
--     per-feature, per-model AI cost reporting.
-- Idempotent. Run in the Supabase SQL Editor.

ALTER TABLE api_usage_log ALTER COLUMN call_id DROP NOT NULL;
ALTER TABLE api_usage_log ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE api_usage_log ADD COLUMN IF NOT EXISTS model TEXT;

CREATE INDEX IF NOT EXISTS idx_api_usage_source ON api_usage_log(user_id, source);

NOTIFY pgrst, 'reload schema';
