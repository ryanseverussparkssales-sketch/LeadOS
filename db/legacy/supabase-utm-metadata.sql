-- UTM parameters + metadata passthrough for contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS utm_content TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS utm_term TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_metadata JSONB DEFAULT '{}';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_source_id UUID REFERENCES lead_sources(id) ON DELETE SET NULL;

-- Index for source attribution queries
CREATE INDEX IF NOT EXISTS idx_contacts_lead_source_id ON contacts(lead_source_id);
CREATE INDEX IF NOT EXISTS idx_contacts_utm_source ON contacts(utm_source) WHERE utm_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_utm_campaign ON contacts(utm_campaign) WHERE utm_campaign IS NOT NULL;

-- Add edit/delete support to lead_sources (fields were missing)
ALTER TABLE lead_sources ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE lead_sources ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE lead_sources ADD COLUMN IF NOT EXISTS metadata_schema JSONB DEFAULT '[]';
-- metadata_schema: [{key: 'ad_set_id', label: 'Ad Set ID', type: 'string'}]
-- defines what extra fields this source captures

-- Track daily/weekly lead counts per source
ALTER TABLE lead_sources ADD COLUMN IF NOT EXISTS leads_today INTEGER DEFAULT 0;
ALTER TABLE lead_sources ADD COLUMN IF NOT EXISTS leads_this_week INTEGER DEFAULT 0;
ALTER TABLE lead_sources ADD COLUMN IF NOT EXISTS last_lead_at TIMESTAMPTZ;
