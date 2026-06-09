-- ============================================================
-- LeadOS — Campaigns Migration
-- Run this in Supabase SQL Editor AFTER the initial schema
-- Adds: campaigns table between projects and call_lists
-- Hierarchy: Client → Project → Campaign → Call List → Contacts
-- ============================================================

-- 1. Create campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Add campaign_id to call_lists (nullable for migration)
ALTER TABLE call_lists ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE;

-- 3. RLS for campaigns
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaigns_all" ON campaigns FOR ALL USING (
  EXISTS (
    SELECT 1 FROM projects
    JOIN clients ON clients.id = projects.client_id
    WHERE projects.id = campaigns.project_id AND clients.user_id = auth.uid()
  )
);

-- 4. Index
CREATE INDEX IF NOT EXISTS idx_campaigns_project ON campaigns(project_id);
CREATE INDEX IF NOT EXISTS idx_call_lists_campaign ON call_lists(campaign_id);

-- ============================================================
-- IF STARTING FRESH (no real data yet) — run this block too
-- to make campaign_id required on call_lists:
-- ============================================================
-- ALTER TABLE call_lists ALTER COLUMN campaign_id SET NOT NULL;
-- ALTER TABLE call_lists DROP COLUMN IF EXISTS project_id;
-- (Only run these if you have no call list data you need to keep)
