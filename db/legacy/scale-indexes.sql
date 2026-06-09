-- =============================================================================
-- LeadOS Scale Indexes — run in Supabase SQL Editor
-- Required before scaling to 100k contacts / 30 reps / 30 numbers
-- =============================================================================

-- ── contacts ──────────────────────────────────────────────────────────────────
-- Primary filtered list query (contacts/filtered endpoint)
CREATE INDEX IF NOT EXISTS idx_contacts_user_status
  ON contacts(user_id, status)
  WHERE deleted_at IS NULL;

-- Duplicate check on CSV import (batch IN query)
CREATE INDEX IF NOT EXISTS idx_contacts_user_phone
  ON contacts(user_id, phone_normalized)
  WHERE deleted_at IS NULL;

-- Test data filter (is_test = false by default)
CREATE INDEX IF NOT EXISTS idx_contacts_user_test
  ON contacts(user_id, is_test)
  WHERE deleted_at IS NULL;

-- Contact score ordering (calls/next fallback path)
CREATE INDEX IF NOT EXISTS idx_contacts_user_score
  ON contacts(user_id, contact_score DESC NULLS LAST)
  WHERE deleted_at IS NULL AND status = 'active';

-- ── calls ─────────────────────────────────────────────────────────────────────
-- Today's calls aggregate (agency dashboard, daily reset)
CREATE INDEX IF NOT EXISTS idx_calls_user_created
  ON calls(user_id, created_at DESC);

-- Campaign call counts (campaign analytics, win tracking)
CREATE INDEX IF NOT EXISTS idx_calls_campaign_created
  ON calls(campaign_id, created_at DESC)
  WHERE campaign_id IS NOT NULL;

-- Call list call history
CREATE INDEX IF NOT EXISTS idx_calls_list_created
  ON calls(call_list_id, created_at DESC)
  WHERE call_list_id IS NOT NULL;

-- ── call_list_contacts ────────────────────────────────────────────────────────
-- Next contact lookup (the hottest query — fires on every dial)
CREATE INDEX IF NOT EXISTS idx_clc_list_status_pos
  ON call_list_contacts(call_list_id, status, queue_position)
  WHERE status = 'pending';

-- ── campaign_contacts ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cc_campaign
  ON campaign_contacts(campaign_id);

CREATE INDEX IF NOT EXISTS idx_cc_contact
  ON campaign_contacts(contact_id);

-- ── phone_numbers ─────────────────────────────────────────────────────────────
-- Local presence lookup (area code matching)
CREATE INDEX IF NOT EXISTS idx_phone_numbers_user_status
  ON phone_numbers(user_id, status)
  WHERE status = 'active';

-- ── team_members ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_team_members_owner_role
  ON team_members(owner_user_id, role)
  WHERE portal_access = false;

CREATE INDEX IF NOT EXISTS idx_team_members_member_user
  ON team_members(member_user_id);

-- ── payouts ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payouts_owner_status
  ON payouts(owner_user_id, status);

CREATE INDEX IF NOT EXISTS idx_payouts_member
  ON payouts(team_member_id);

-- ── call_feedback (new) ───────────────────────────────────────────────────────
-- Already has idx_call_feedback_call_id_idx from feature-migrations.sql

-- =============================================================================
-- ANALYZE — update planner statistics after index creation
-- =============================================================================
ANALYZE contacts;
ANALYZE calls;
ANALYZE call_list_contacts;
ANALYZE campaign_contacts;
ANALYZE phone_numbers;
ANALYZE team_members;
