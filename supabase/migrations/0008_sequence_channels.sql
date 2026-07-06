-- 0008: Multi-channel sequence steps (Workstream 2H)
-- Adds a per-step channel so sequences can mix email, SMS, and call tasks.
--   channel:  'email' (default, existing behavior) | 'sms' | 'call_task'
--   sms_body: message text for channel='sms' steps (subject/body stay email-only)
-- No CHECK constraint — baseline style validates values in application code
-- (see /api/sequences POST and /api/sequences/advance).
-- Run in: Supabase SQL Editor. Idempotent.

ALTER TABLE public.sequence_steps
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email';

ALTER TABLE public.sequence_steps
  ADD COLUMN IF NOT EXISTS sms_body text;

NOTIFY pgrst, 'reload schema';
