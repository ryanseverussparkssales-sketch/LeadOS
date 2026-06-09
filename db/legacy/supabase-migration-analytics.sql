-- ============================================================
-- LeadOS — Analytics Migration
-- Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS api_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  call_id UUID NOT NULL REFERENCES calls(id),
  twilio_duration_minutes INTEGER DEFAULT 0,
  twilio_cost DECIMAL(10, 4) DEFAULT 0,
  groq_cost DECIMAL(10, 6) DEFAULT 0,
  claude_input_tokens INTEGER DEFAULT 0,
  claude_output_tokens INTEGER DEFAULT 0,
  claude_cost DECIMAL(10, 4) DEFAULT 0,
  total_cost DECIMAL(10, 4) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  session_start TIMESTAMP DEFAULT NOW(),
  session_end TIMESTAMP,
  duration_seconds INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dialer_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  session_id UUID REFERENCES user_sessions(id),
  project_id UUID REFERENCES projects(id),
  campaign_id UUID REFERENCES campaigns(id),
  activity_type TEXT, -- calling, post_mortem, waiting, idle
  activity_start TIMESTAMP DEFAULT NOW(),
  activity_end TIMESTAMP,
  duration_seconds INTEGER,
  call_id UUID REFERENCES calls(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_api_usage_user ON api_usage_log(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_call ON api_usage_log(call_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage_log(created_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_dialer_activity_user ON dialer_activity(user_id);

-- RLS
ALTER TABLE api_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dialer_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usage_log_all" ON api_usage_log FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "sessions_all" ON user_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "activity_all" ON dialer_activity FOR ALL USING (auth.uid() = user_id);
