-- Campaign type system
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS campaign_type TEXT DEFAULT 'call';
-- Types: 'call' | 'email' | 'sms' | 'mixed'

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS email_sequence_id UUID REFERENCES email_sequences(id) ON DELETE SET NULL;
-- Link to a sequence for email campaigns

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS goal TEXT;
-- e.g. "Book 10 demos this month"

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_contacts INTEGER;
-- Intended contact count

CREATE INDEX IF NOT EXISTS idx_campaigns_type ON campaigns(user_id, campaign_type);
