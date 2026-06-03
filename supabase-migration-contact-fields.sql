-- ============================================================
-- LeadOS — Enhanced Contact Fields Migration
-- ============================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS contact_type TEXT DEFAULT 'lead';
-- Values: lead | prospect | customer | partner | vendor | other

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_source TEXT;
-- Values: cold_call | csv_import | web_scrape | referral | manual | linkedin | website | trade_show | other

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_business BOOLEAN DEFAULT false;
-- B2B flag: true = business contact, false = individual

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes TEXT;
-- General notes (separate from call-specific notes)

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS customer_since DATE;
-- When this lead became a customer

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS do_not_email BOOLEAN DEFAULT false;

-- Index on contact_type and lead_source for filtering
CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts(contact_type);
CREATE INDEX IF NOT EXISTS idx_contacts_source ON contacts(lead_source);
