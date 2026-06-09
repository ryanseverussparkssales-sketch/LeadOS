-- Soft delete support for LeadOS
-- Run in Supabase SQL Editor — all statements are safe to re-run

ALTER TABLE contacts    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE clients     ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE campaigns   ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE projects    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE deals       ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE call_lists  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Indexes for fast trash queries
-- contacts/clients/deals have direct user_id; campaigns/projects owned via clients
CREATE INDEX IF NOT EXISTS idx_contacts_deleted_at   ON contacts(user_id, deleted_at)  WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_deleted_at    ON clients(user_id, deleted_at)   WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_deleted_at      ON deals(user_id, deleted_at)     WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_deleted_at  ON campaigns(deleted_at)           WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_deleted_at   ON projects(deleted_at)            WHERE deleted_at IS NOT NULL;
