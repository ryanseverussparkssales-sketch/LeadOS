-- ============================================================
-- LeadOS — Sales Features: Voicemail Drop, SMS, Deals
-- ============================================================

-- Pre-recorded voicemail messages for dropping
CREATE TABLE IF NOT EXISTS voicemail_drops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  audio_url TEXT,       -- hosted audio file URL
  duration_seconds INTEGER,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- SMS logs (inbound + outbound)
CREATE TABLE IF NOT EXISTS sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  contact_id UUID REFERENCES contacts(id),
  phone_number_id UUID REFERENCES phone_numbers(id),
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  body TEXT NOT NULL,
  direction TEXT NOT NULL, -- outbound | inbound
  status TEXT DEFAULT 'sent',  -- queued | sent | delivered | failed | received
  twilio_sid TEXT,
  sent_at TIMESTAMP DEFAULT NOW()
);

-- Deal pipeline
CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  contact_id UUID REFERENCES contacts(id),
  client_id UUID REFERENCES clients(id),
  campaign_id UUID REFERENCES campaigns(id),
  title TEXT NOT NULL,
  value DECIMAL(12,2) DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'prospect',
  -- Stages: prospect | qualified | demo | proposal | negotiation | won | lost
  probability INTEGER DEFAULT 20, -- 0-100%
  expected_close DATE,
  notes TEXT,
  lost_reason TEXT,
  won_at TIMESTAMP,
  lost_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_voicemail_drops_user ON voicemail_drops(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_user ON sms_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_contact ON sms_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_deals_user ON deals(user_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
CREATE INDEX IF NOT EXISTS idx_deals_contact ON deals(contact_id);

-- RLS
ALTER TABLE voicemail_drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vm_drops_all" ON voicemail_drops FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "sms_logs_all" ON sms_logs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "deals_all" ON deals FOR ALL USING (auth.uid() = user_id);
