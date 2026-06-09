-- ============================================================
-- LeadOS — Settings & Security Migration
-- ============================================================

CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
  company_name TEXT,
  company_email TEXT,
  company_phone TEXT,
  company_website TEXT,
  hourly_rate DECIMAL(10,2) DEFAULT 150,
  currency TEXT DEFAULT 'USD',
  timezone TEXT DEFAULT 'America/Chicago',
  auto_record_calls BOOLEAN DEFAULT true,
  auto_transcribe_calls BOOLEAN DEFAULT true,
  email_voicemail_transcripts BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scopes TEXT[] DEFAULT ARRAY['read'],
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS login_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  ip_address TEXT,
  user_agent TEXT,
  device_name TEXT,
  login_at TIMESTAMP DEFAULT NOW(),
  status TEXT DEFAULT 'active'
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user ON user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_login_activity_user ON login_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_login_activity_login_at ON login_activity(login_at);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings_all" ON user_settings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "api_tokens_all" ON api_tokens FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "login_activity_all" ON login_activity FOR ALL USING (auth.uid() = user_id);
