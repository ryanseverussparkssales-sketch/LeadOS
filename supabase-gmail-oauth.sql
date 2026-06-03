-- Gmail OAuth fields for email_accounts table
-- Run this in Supabase SQL Editor

-- Provider type: 'smtp' | 'gmail' | 'outlook'
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'smtp';

-- OAuth tokens (stored encrypted via vault pattern)
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS oauth_access_token TEXT;
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS oauth_refresh_token TEXT;
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS oauth_token_expires_at TIMESTAMPTZ;
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS oauth_scopes TEXT[];

-- Gmail incremental sync — avoids re-fetching all mail on every poll
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS gmail_history_id TEXT;

-- Sync state
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS sync_enabled BOOLEAN DEFAULT TRUE;

-- Prevent duplicate connections to the same Google account
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS google_account_id TEXT;

-- Add 'email' column as alias for email_address so OAuth upsert can use a consistent key
-- (email_accounts originally used email_address; OAuth flow uses 'email' for brevity)
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS email TEXT
    GENERATED ALWAYS AS (email_address) STORED;

-- Make smtp_password_encrypted nullable so OAuth accounts don't need it
ALTER TABLE email_accounts ALTER COLUMN smtp_password_encrypted DROP NOT NULL;
ALTER TABLE email_accounts ALTER COLUMN smtp_host DROP NOT NULL;
ALTER TABLE email_accounts ALTER COLUMN smtp_port DROP NOT NULL;
ALTER TABLE email_accounts ALTER COLUMN smtp_user DROP NOT NULL;

-- Unique constraint to allow upsert on (user_id, email_address) for OAuth accounts
ALTER TABLE email_accounts DROP CONSTRAINT IF EXISTS email_accounts_user_email_unique;
ALTER TABLE email_accounts ADD CONSTRAINT email_accounts_user_email_unique
    UNIQUE (user_id, email_address);

-- Index for sync job — quickly find all gmail accounts that need polling
CREATE INDEX IF NOT EXISTS idx_email_accounts_provider ON email_accounts(user_id, provider)
    WHERE provider != 'smtp';

CREATE INDEX IF NOT EXISTS idx_email_accounts_sync ON email_accounts(provider, sync_enabled, last_synced_at)
    WHERE provider = 'gmail' AND sync_enabled = TRUE;
