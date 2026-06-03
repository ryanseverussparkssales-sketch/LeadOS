-- Email accounts for multi-sender support
-- Each account is a Gmail (or other SMTP) linked to a client/project
CREATE TABLE IF NOT EXISTS email_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    label TEXT NOT NULL,               -- e.g. "Welfel Ventures - Bryan"
    email_address TEXT NOT NULL,       -- e.g. "bryan@welfelventures.com"
    smtp_host TEXT NOT NULL DEFAULT 'smtp.gmail.com',
    smtp_port INTEGER NOT NULL DEFAULT 587,
    smtp_user TEXT NOT NULL,           -- usually same as email_address for Gmail
    smtp_password_encrypted TEXT NOT NULL,  -- encrypted App Password
    is_default BOOLEAN DEFAULT false,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    -- When set, this account is auto-used for emails to/about this client
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_accounts_owner" ON email_accounts
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_email_accounts_user ON email_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_email_accounts_client ON email_accounts(client_id) WHERE client_id IS NOT NULL;

-- Also add RESEND_API_KEY placeholder to settings (not a table change, just documentation)
-- Store RESEND_API_KEY in Vercel env vars for fallback sending
