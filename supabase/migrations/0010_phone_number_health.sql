-- 0010_phone_number_health.sql
-- Phone number health tracking (Workstream 4L).
-- Promotes db/legacy/phone-number-health-migration.sql into the ordered
-- migration chain. Only the pieces missing from 0000_baseline.sql are applied:
--   * phone_numbers.calls_today already exists in the baseline
--     (integer DEFAULT 0), so it is NOT re-added here.
--   * phone_numbers.daily_limit is NOT in the baseline — added below with the
--     legacy default of 200.
-- The legacy file defines no indexes, so none are created here.

ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS daily_limit int NOT NULL DEFAULT 200;

COMMENT ON COLUMN public.phone_numbers.daily_limit IS
  'Max outbound calls per day for this number before it is considered over-utilized. Legacy default 200. NOTE: /api/phone/health falls back to 100 in JS when this column is null/missing — reconcile app-level default with this DB default.';

-- Refresh PostgREST schema cache so the new column is immediately visible.
NOTIFY pgrst, 'reload schema';
