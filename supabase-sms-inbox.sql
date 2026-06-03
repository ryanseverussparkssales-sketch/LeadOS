-- ── SMS Inbox Infrastructure ──────────────────────────────────

-- Add missing columns to sms_logs
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
-- NULL = unread (for inbound messages), NOT NULL = read

ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS intent_label TEXT;
-- AI classification: 'interested' | 'objection' | 'opt_out' | 'question' | 'callback_request' | 'referral' | 'neutral' | 'positive_reply'

ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS intent_score DECIMAL(3,2);
-- 0.0 to 1.0 confidence

ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS thread_id UUID;
-- Groups messages into a conversation thread per contact per phone_number

ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS is_opted_out BOOLEAN DEFAULT FALSE;
-- TRUE when STOP keyword detected

-- Fix: phone_number_id was never written on inbound — add it now
-- (already exists as column, just not populated)

-- Create thread index for fast conversation loading
CREATE INDEX IF NOT EXISTS idx_sms_logs_thread ON sms_logs(thread_id, sent_at DESC)
    WHERE thread_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sms_logs_contact_direction ON sms_logs(contact_id, direction, sent_at DESC)
    WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sms_logs_unread ON sms_logs(user_id, read_at)
    WHERE direction = 'inbound' AND read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sms_logs_from_number ON sms_logs(from_number, sent_at DESC);

-- Conversation threads table — one row per contact per phone number
CREATE TABLE IF NOT EXISTS sms_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    phone_number_id UUID REFERENCES phone_numbers(id) ON DELETE SET NULL,
    -- The "other party" number (contact or unknown)
    remote_number TEXT NOT NULL,
    -- Our number
    local_number TEXT NOT NULL,
    last_message_at TIMESTAMPTZ,
    last_message_body TEXT,
    last_message_direction TEXT, -- 'inbound' | 'outbound'
    unread_count INTEGER DEFAULT 0,
    is_opted_out BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, remote_number, local_number)
);

CREATE INDEX IF NOT EXISTS idx_sms_threads_user ON sms_threads(user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_threads_contact ON sms_threads(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sms_threads_unread ON sms_threads(user_id, unread_count) WHERE unread_count > 0;

ALTER TABLE sms_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own SMS threads" ON sms_threads
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Update sms_logs to reference thread
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS sms_thread_id UUID REFERENCES sms_threads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sms_logs_thread_id ON sms_logs(sms_thread_id, sent_at ASC);
