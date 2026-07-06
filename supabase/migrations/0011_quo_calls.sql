-- 0011_quo_calls.sql
-- Native Quo (formerly OpenPhone) calling integration.
--
-- The calls table already carries everything a Quo call needs
-- (user_id, contact_id, outcome, notes, recording_url, raw_transcript,
--  summary, call_duration_seconds, started_at, ended_at, created_at,
--  processed_at, direction, status). We only add provenance columns so a
-- Quo-sourced call can be de-duplicated across the webhook + sync paths.

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS provider text;

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS provider_call_id text;

-- Upsert key for Quo calls: (provider, provider_call_id). Lets the webhook and
-- the sync endpoint converge on the same row instead of double-inserting.
CREATE INDEX IF NOT EXISTS idx_calls_provider_call
  ON public.calls USING btree (provider, provider_call_id);

-- Reload PostgREST schema cache so the new columns are queryable immediately.
NOTIFY pgrst, 'reload schema';
