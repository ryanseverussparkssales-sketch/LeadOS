-- ============================================================
-- LeadOS — Lead Scraper Migration
-- ============================================================

CREATE TABLE IF NOT EXISTS scraped_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  source TEXT,        -- 'web_scrape' | 'screenshot' | 'manual'
  source_url TEXT,
  raw_name TEXT,
  raw_email TEXT,
  raw_phone TEXT,
  raw_title TEXT,
  raw_company TEXT,
  confidence DECIMAL(3,2) DEFAULT 0.8,
  status TEXT DEFAULT 'pending', -- pending | added | rejected
  contact_id UUID REFERENCES contacts(id), -- set when added to contacts
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_enrichments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  contact_id UUID NOT NULL REFERENCES contacts(id),
  company_summary TEXT,
  outreach_angle TEXT,
  personalized_message TEXT,
  talking_points TEXT,
  enriched_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scraped_contacts_user ON scraped_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_scraped_contacts_status ON scraped_contacts(status);
CREATE INDEX IF NOT EXISTS idx_enrichments_contact ON contact_enrichments(contact_id);

ALTER TABLE scraped_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_enrichments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scraped_all" ON scraped_contacts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "enrichments_all" ON contact_enrichments FOR ALL USING (auth.uid() = user_id);
