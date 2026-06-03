-- ============================================================
-- LeadOS — New additions since last migration run
-- Run this in Supabase SQL Editor
-- Everything here is safe to run (IF NOT EXISTS throughout)
-- ============================================================

-- Dashboard widget layout persistence
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS dashboard_layout JSONB;

-- (contact_client_assoc, contact_campaign_assoc, contact_project_assoc
--  tables and policies were already created in your previous run — skip those)
