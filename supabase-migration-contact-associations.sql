-- ============================================================
-- LeadOS — Contact Associations Migration
-- Many-to-many: contacts <-> clients, campaigns, projects
-- Call list membership already handled by call_list_contacts
-- ============================================================

-- Contact ↔ Client (direct association, beyond call list membership)
CREATE TABLE IF NOT EXISTS contact_client_assoc (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(contact_id, client_id)
);

-- Contact ↔ Campaign
CREATE TABLE IF NOT EXISTS contact_campaign_assoc (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(contact_id, campaign_id)
);

-- Contact ↔ Project
CREATE TABLE IF NOT EXISTS contact_project_assoc (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(contact_id, project_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cca_contact ON contact_client_assoc(contact_id);
CREATE INDEX IF NOT EXISTS idx_cca_client ON contact_client_assoc(client_id);
CREATE INDEX IF NOT EXISTS idx_ccampa_contact ON contact_campaign_assoc(contact_id);
CREATE INDEX IF NOT EXISTS idx_ccampa_campaign ON contact_campaign_assoc(campaign_id);
CREATE INDEX IF NOT EXISTS idx_cpa_contact ON contact_project_assoc(contact_id);
CREATE INDEX IF NOT EXISTS idx_cpa_project ON contact_project_assoc(project_id);

-- RLS
ALTER TABLE contact_client_assoc ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_campaign_assoc ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_project_assoc ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cca_all" ON contact_client_assoc FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "ccampa_all" ON contact_campaign_assoc FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "cpa_all" ON contact_project_assoc FOR ALL USING (auth.uid() = user_id);
