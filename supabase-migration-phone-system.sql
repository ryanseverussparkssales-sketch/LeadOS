-- ============================================================
-- LeadOS — Phone System Migration
-- ============================================================

CREATE TABLE IF NOT EXISTS phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  phone_number TEXT NOT NULL,
  twilio_phone_sid TEXT,
  friendly_name TEXT,
  client_id UUID REFERENCES clients(id),
  campaign_id UUID REFERENCES campaigns(id),
  status TEXT DEFAULT 'active',       -- active | paused | released
  is_primary BOOLEAN DEFAULT false,
  voicemail_greeting TEXT,
  record_incoming BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, phone_number)
);

CREATE TABLE IF NOT EXISTS voicemails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  phone_number_id UUID REFERENCES phone_numbers(id),
  caller_id TEXT NOT NULL,
  caller_name TEXT,
  duration_seconds INTEGER,
  recording_url TEXT,
  transcript TEXT,
  status TEXT DEFAULT 'unread',       -- unread | read | archived
  received_at TIMESTAMP DEFAULT NOW(),
  listened_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS missed_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  phone_number_id UUID REFERENCES phone_numbers(id),
  caller_id TEXT NOT NULL,
  caller_name TEXT,
  call_duration_seconds INTEGER DEFAULT 0,
  returned BOOLEAN DEFAULT false,
  returned_at TIMESTAMP,
  notes TEXT,
  received_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_phone_numbers_user ON phone_numbers(user_id);
CREATE INDEX IF NOT EXISTS idx_voicemails_user ON voicemails(user_id);
CREATE INDEX IF NOT EXISTS idx_voicemails_status ON voicemails(status);
CREATE INDEX IF NOT EXISTS idx_missed_calls_user ON missed_calls(user_id);
CREATE INDEX IF NOT EXISTS idx_missed_calls_returned ON missed_calls(returned);

-- RLS
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE voicemails ENABLE ROW LEVEL SECURITY;
ALTER TABLE missed_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "phone_numbers_all" ON phone_numbers FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "voicemails_all" ON voicemails FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "missed_calls_all" ON missed_calls FOR ALL USING (auth.uid() = user_id);
