-- ============================================================
-- Campaign Sender Routing + Flexible Win Goals
-- Run this in Supabase SQL Editor
-- ============================================================

-- Campaign sender routing (choose which email + phone to use per campaign)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS from_email_account_id UUID REFERENCES email_accounts(id) ON DELETE SET NULL;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS from_phone_number_id UUID REFERENCES phone_numbers(id) ON DELETE SET NULL;

-- Project-level defaults (campaigns inherit if not set)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS from_email_account_id UUID REFERENCES email_accounts(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS from_phone_number_id UUID REFERENCES phone_numbers(id) ON DELETE SET NULL;

-- Flexible win/goal tracking (not tied to deal revenue)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS win_outcome TEXT;
-- The call outcome that = a win for this campaign
-- e.g. 'appointment_set' | 'demo_scheduled' | 'info_provided' | 'interested' | 'callback'

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS win_label TEXT;
-- Human label: "Appointment Booked", "Demo Scheduled", "Info Provided"

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS win_count INTEGER DEFAULT 0;

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_wins INTEGER;
-- e.g. target_wins=10 means "book 10 demos this month"

-- Custom call outcomes per campaign (stored as JSONB array of {value, label} objects)
-- Allows campaigns to define their own outcome options beyond the global list
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS custom_outcomes JSONB;
-- e.g. [{"value":"info_provided","label":"Provided Investment Info"},{"value":"appointment_set","label":"Appointment Booked"}]

-- Add campaign_id to contact_sequences so advance route can resolve sender
ALTER TABLE contact_sequences ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;
