-- Phone number enhancements: forwarding, SMS toggle, voicemail config
ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS forwarding_number TEXT;
-- E.164 format e.g. +16125551234, or null for no forwarding
ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS forwarding_enabled BOOLEAN DEFAULT false;
ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS sms_enabled BOOLEAN DEFAULT true;
-- When false, incoming SMS webhooks are not set for this number
ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS voicemail_enabled BOOLEAN DEFAULT true;
ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS voicemail_transcribe BOOLEAN DEFAULT true;
ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS ring_timeout_seconds INTEGER DEFAULT 20;
-- How long to ring before going to voicemail
