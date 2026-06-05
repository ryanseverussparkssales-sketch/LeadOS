-- ============================================================================
-- RogueOS / LeadOS — backend hardening deployment
-- Date: 2026-06-05
-- Run this ONCE in the Supabase SQL editor (or psql). Every statement is
-- idempotent, so re-running is safe.
--
-- Covers:
--   1. Per-tenant Twilio credentials   (user_settings.twilio_* columns)
--   2. Payouts feature base schema      (was never run — payouts table missing)
--   3. Payout double-pay guard          (unique index on payouts)
-- ============================================================================


-- ── 1. Per-tenant Twilio credentials ────────────────────────────────────────
-- Onboarding collects each agency's own Twilio account and POSTs it to
-- /api/settings, which upserts into user_settings. These columns never existed,
-- so that write was silently rejected and customers' creds were lost — the
-- desk-phone dialer then fell back to the platform env account (or nothing).
-- getTwilioCreds() in src/lib/server/twilio.ts reads exactly these columns.
-- The two *secret* columns are written encrypted by /api/settings; the read path
-- decrypts tolerantly, so plaintext historical values (if any) keep working.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS twilio_account_sid     TEXT,
  ADD COLUMN IF NOT EXISTS twilio_auth_token      TEXT,  -- encrypted
  ADD COLUMN IF NOT EXISTS twilio_api_key_sid     TEXT,
  ADD COLUMN IF NOT EXISTS twilio_api_key_secret  TEXT,  -- encrypted
  ADD COLUMN IF NOT EXISTS twilio_twiml_app_sid   TEXT,
  ADD COLUMN IF NOT EXISTS twilio_client_identity TEXT,
  ADD COLUMN IF NOT EXISTS twilio_phone_number    TEXT;


-- ── 2. Payouts feature base schema ──────────────────────────────────────────
-- The original feature-migrations.sql (call feedback + Stripe payouts) was never
-- applied, so the payouts table and the team_members Stripe columns don't exist.
-- The /api/payouts route reads team_members.stripe_connect_account_id /
-- stripe_connect_status / member_email and writes payout rows, so create them all.

-- 2a. Call feedback (manager coaching notes per call)
CREATE TABLE IF NOT EXISTS call_feedback (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id            UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  reviewer_user_id   UUID NOT NULL,
  content            TEXT NOT NULL,
  timestamp_seconds  INT,
  rating             INT CHECK (rating BETWEEN 1 AND 5),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS call_feedback_call_id_idx ON call_feedback(call_id);

-- 2b. Stripe Connect + verbal-approval columns on team members
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_connect_status     TEXT NOT NULL DEFAULT 'not_connected',
  ADD COLUMN IF NOT EXISTS verbal_approved_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verbal_approved_by        UUID;
  -- stripe_connect_status: not_connected | pending | active

-- 2c. Payouts ledger
CREATE TABLE IF NOT EXISTS payouts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id      UUID NOT NULL,
  team_member_id     UUID REFERENCES team_members(id) ON DELETE SET NULL,
  call_id            UUID REFERENCES calls(id) ON DELETE SET NULL,
  amount_cents       INT NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'usd',
  stripe_transfer_id TEXT,
  status             TEXT NOT NULL DEFAULT 'pending',
    -- pending | processing | paid | failed | cancelled
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at            TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS payouts_owner_idx  ON payouts(owner_user_id);
CREATE INDEX IF NOT EXISTS payouts_member_idx ON payouts(team_member_id);
CREATE INDEX IF NOT EXISTS payouts_call_idx   ON payouts(call_id);


-- ── 3. Payout double-pay guard ──────────────────────────────────────────────
-- The payouts approval route reserves a row per (call_id, team_member_id) BEFORE
-- moving money and relies on this unique index as the concurrency gate: a racing
-- duplicate insert fails with 23505 instead of triggering a second Stripe
-- transfer. NULLs are distinct in a unique index, so payouts whose call was
-- deleted (call_id set NULL) never collide. If duplicate rows already exist this
-- CREATE will fail — de-duplicate first, then re-run.

CREATE UNIQUE INDEX IF NOT EXISTS payouts_call_member_uniq
  ON payouts (call_id, team_member_id)
  WHERE call_id IS NOT NULL;


-- ── Verification (optional) ─────────────────────────────────────────────────
SELECT column_name
  FROM information_schema.columns
 WHERE table_name = 'user_settings'
   AND column_name LIKE 'twilio_%'
 ORDER BY column_name;

SELECT to_regclass('public.payouts')      AS payouts_table,
       to_regclass('public.call_feedback') AS call_feedback_table;

SELECT indexname
  FROM pg_indexes
 WHERE tablename = 'payouts'
   AND indexname = 'payouts_call_member_uniq';
