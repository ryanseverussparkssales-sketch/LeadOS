-- LeadOS Scraper Upgrade Migration
-- Run this in your Supabase SQL editor to support the new scraper modes:
-- search, streamer, csv_import

ALTER TABLE scraped_contacts ADD COLUMN IF NOT EXISTS source_query TEXT;
ALTER TABLE scraped_contacts ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;
ALTER TABLE scraped_contacts ADD COLUMN IF NOT EXISTS call_list_id UUID REFERENCES call_lists(id) ON DELETE SET NULL;
ALTER TABLE scraped_contacts ADD COLUMN IF NOT EXISTS notes TEXT;
