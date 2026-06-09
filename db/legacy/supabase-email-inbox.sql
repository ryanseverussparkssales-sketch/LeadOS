-- ── Email Inbox Infrastructure ────────────────────────────────

-- Add direction support to email_logs (currently outbound-only)
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'outbound';
-- 'inbound' | 'outbound'

ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
-- NULL = unread for inbound

ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS from_address TEXT;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS to_address TEXT;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS reply_to TEXT;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS in_reply_to TEXT; -- Message-ID header for threading
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS message_id TEXT UNIQUE; -- Email Message-ID header
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS thread_id TEXT; -- Groups email chains (same subject stripped of Re:/Fwd:)
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS html_body TEXT; -- Original HTML (body column = plain text)
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';
-- [{filename, content_type, size, storage_path}]

ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS intent_label TEXT;
-- Same as SMS: interested | objection | opt_out | question | callback_request | referral | positive_reply | neutral

ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS intent_score DECIMAL(3,2);
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS spam_score DECIMAL(4,2);
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS resend_email_id TEXT; -- Resend's email ID

-- Indexes for inbox queries
CREATE INDEX IF NOT EXISTS idx_email_logs_direction ON email_logs(user_id, direction, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_unread ON email_logs(user_id, read_at)
    WHERE direction = 'inbound' AND read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_email_logs_thread ON email_logs(thread_id, created_at ASC)
    WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_logs_contact_inbound ON email_logs(contact_id, direction, created_at DESC)
    WHERE direction = 'inbound';
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_logs_message_id ON email_logs(message_id)
    WHERE message_id IS NOT NULL;

-- Email threads table
CREATE TABLE IF NOT EXISTS email_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    subject TEXT NOT NULL,
    thread_key TEXT NOT NULL, -- normalized subject (strips Re:/Fwd:)
    last_message_at TIMESTAMPTZ,
    last_message_body TEXT, -- snippet
    last_message_direction TEXT,
    unread_count INTEGER DEFAULT 0,
    message_count INTEGER DEFAULT 0,
    participants TEXT[], -- email addresses involved
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, thread_key, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_email_threads_user ON email_threads(user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_threads_unread ON email_threads(user_id, unread_count) WHERE unread_count > 0;

ALTER TABLE email_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own email threads" ON email_threads
    FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Link email_logs to email_threads
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS email_thread_id UUID REFERENCES email_threads(id) ON DELETE SET NULL;
