-- ─────────────────────────────────────────────────────────────────────────────
-- Reply-To Campaign Tagging — schema additions
-- Run once against your Supabase project.
-- ─────────────────────────────────────────────────────────────────────────────

-- Add campaign/project/client routing columns to email_logs
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS project_id  UUID REFERENCES projects(id)  ON DELETE SET NULL;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS client_id   UUID REFERENCES clients(id)   ON DELETE SET NULL;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS reply_tag   TEXT;
-- reply_tag: the full +subaddress extracted from the To header (for debugging / re-parsing)

-- Index: fast campaign-scoped email queries (e.g. "show all emails for campaign X")
CREATE INDEX IF NOT EXISTS idx_email_logs_campaign
    ON email_logs(campaign_id, created_at DESC)
    WHERE campaign_id IS NOT NULL;

-- Index: fast client-scoped directional queries (e.g. "all inbound for client X")
CREATE INDEX IF NOT EXISTS idx_email_logs_client
    ON email_logs(client_id, direction, created_at DESC)
    WHERE client_id IS NOT NULL;

-- Add inbound_address to email_accounts so we know which Resend inbound domain
-- this account receives on (e.g. "reply@mail.sparks.agency")
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS inbound_address TEXT;
