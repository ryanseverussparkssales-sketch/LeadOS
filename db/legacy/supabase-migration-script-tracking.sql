-- ============================================================
-- LeadOS — Script Tracking & Call Type Migration
-- ============================================================

-- Add call type and script tracking to calls
ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_type TEXT DEFAULT 'cold_call';
-- Values: cold_call | follow_up | callback | demo | check_in | warm | referral

ALTER TABLE calls ADD COLUMN IF NOT EXISTS script_id UUID REFERENCES scripts(id);
-- Which script was active during this call

-- Log which objections were encountered during each call
CREATE TABLE IF NOT EXISTS script_objection_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  script_id UUID NOT NULL REFERENCES scripts(id),
  objection_id UUID NOT NULL REFERENCES script_objections(id),
  logged_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_objection_logs_call ON script_objection_logs(call_id);
CREATE INDEX IF NOT EXISTS idx_objection_logs_script ON script_objection_logs(script_id);
CREATE INDEX IF NOT EXISTS idx_objection_logs_objection ON script_objection_logs(objection_id);
CREATE INDEX IF NOT EXISTS idx_calls_script ON calls(script_id);
CREATE INDEX IF NOT EXISTS idx_calls_type ON calls(call_type);

ALTER TABLE script_objection_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "obj_logs_all" ON script_objection_logs FOR ALL USING (
  EXISTS (SELECT 1 FROM calls WHERE calls.id = script_objection_logs.call_id AND calls.user_id = auth.uid())
);

-- Call quality scoring (add to existing script tracking migration)
ALTER TABLE calls ADD COLUMN IF NOT EXISTS quality_score INTEGER;   -- 0-10
ALTER TABLE calls ADD COLUMN IF NOT EXISTS quality_breakdown TEXT;  -- JSON with details
