-- ============================================================
-- Feature migrations: call feedback + Stripe payouts
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Call feedback (manager coaching notes per call)
CREATE TABLE IF NOT EXISTS call_feedback (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id            UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  reviewer_user_id   UUID NOT NULL,
  content            TEXT NOT NULL,
  timestamp_seconds  INT,                          -- jump-to point in recording
  rating             INT CHECK (rating BETWEEN 1 AND 5),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS call_feedback_call_id_idx ON call_feedback(call_id);

-- 2. Stripe Connect on team members
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_connect_status TEXT NOT NULL DEFAULT 'not_connected';
  -- statuses: not_connected | pending | active

-- 3. Payouts ledger
CREATE TABLE IF NOT EXISTS payouts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id      UUID NOT NULL,
  team_member_id     UUID REFERENCES team_members(id) ON DELETE SET NULL,
  call_id            UUID REFERENCES calls(id) ON DELETE SET NULL,
  amount_cents       INT NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'usd',
  stripe_transfer_id TEXT,
  status             TEXT NOT NULL DEFAULT 'pending',
    -- pending | paid | failed | cancelled
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at            TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS payouts_owner_idx       ON payouts(owner_user_id);
CREATE INDEX IF NOT EXISTS payouts_member_idx      ON payouts(team_member_id);
CREATE INDEX IF NOT EXISTS payouts_call_idx        ON payouts(call_id);

-- ── Verbal approval gate ──────────────────────────────────────────────────────
-- Add pending_verbal status to team_members
-- Existing: active, inactive. New: pending_verbal (awaiting founder call)
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS verbal_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verbal_approved_by  UUID;

-- Default new reps to pending_verbal instead of active
-- (Update your invite flow to set status='pending_verbal')
