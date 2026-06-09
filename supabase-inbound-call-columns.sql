-- Inbound call support — columns the /api/phone/incoming webhook writes to `calls`.
-- Without these, the webhook's insert fails silently and inbound calls never appear
-- in Recent Calls (and the post-call logging panel has no row to attach to).
-- Run in: Supabase Dashboard → SQL Editor. Safe to re-run (IF NOT EXISTS).

ALTER TABLE calls ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'outbound';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS from_number TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS to_number TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS phone_number_id UUID REFERENCES phone_numbers(id);

-- Fast lookup when callbacks resolve a call by its Twilio SID
CREATE INDEX IF NOT EXISTS idx_calls_twilio_sid ON calls(twilio_call_sid);

-- Inbound callers are often not contacts yet — contact_id NOT NULL was rejecting
-- every inbound insert where the caller didn't match (error 23502).
ALTER TABLE calls ALTER COLUMN contact_id DROP NOT NULL;
