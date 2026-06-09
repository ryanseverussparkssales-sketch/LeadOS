-- ============================================================================
-- SCHEMA DRIFT REPAIR — 2026-06-09
-- Source: full audit of code-side table/column references (951 refs, 92 tables)
-- vs live information_schema. Closes every confirmed "code writes/reads a
-- column the DB doesn't have" gap. Idempotent — safe to re-run.
-- Companion report: SCHEMA-AUDIT-2026-06-09.md (incl. code fixes NOT done here)
-- ============================================================================

-- ── calls ── outbound call logging (/api/calls/start) inserts campaign_id
-- unconditionally → every desk-phone outbound call insert FAILS today.
ALTER TABLE calls ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id);
ALTER TABLE calls ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ; -- recording pipeline marks completion

-- ── clients ── add/edit client inserts these; client portal embeds them.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE clients ADD COLUMN IF NOT EXISTS timezone TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contract_status TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contract_value NUMERIC;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS primary_contact_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS primary_contact_email TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS primary_contact_phone TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false;

-- ── contacts ──
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_score INTEGER;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tags TEXT[];

-- ── campaigns ──
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS user_id UUID; -- AI chat scoping; backfilled below

-- ── projects ── agency dashboard embeds these; calls/start inserts user_id
ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id UUID; -- backfilled below
ALTER TABLE projects ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS calls_today INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS daily_call_goal INTEGER;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS target_wins INTEGER;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS win_count INTEGER DEFAULT 0;

-- ── call_lists ──
ALTER TABLE call_lists ADD COLUMN IF NOT EXISTS user_id UUID; -- backfilled below

-- ── contact_sequences ──
ALTER TABLE contact_sequences ADD COLUMN IF NOT EXISTS user_id UUID; -- backfilled below

-- ── sms_threads / sms_logs ── inbound SMS threading writes these today; all fail.
ALTER TABLE sms_threads ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE sms_threads ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE sms_threads ADD COLUMN IF NOT EXISTS direction TEXT;
ALTER TABLE sms_threads ADD COLUMN IF NOT EXISTS last_message TEXT;
ALTER TABLE sms_threads ADD COLUMN IF NOT EXISTS unread BOOLEAN DEFAULT false;
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS intent TEXT;
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS intent_confidence NUMERIC;
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS is_hot BOOLEAN DEFAULT false;

-- ── tasks ── appointments create tasks with hour/minute/notes; notifications filter deleted_at
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS hour INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS minute INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notes TEXT;

-- ── misc singles ──
ALTER TABLE contact_documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE email_threads ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id);
ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS calls_today INTEGER DEFAULT 0;
ALTER TABLE quotas ADD COLUMN IF NOT EXISTS current_value NUMERIC DEFAULT 0;
ALTER TABLE quotas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE sequence_steps ADD COLUMN IF NOT EXISTS delay_hours INTEGER DEFAULT 0;
ALTER TABLE sequence_steps ADD COLUMN IF NOT EXISTS step_order INTEGER;

-- ── user_preferences ── Spotify OAuth callback writes flat token columns
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS access_token TEXT;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS refresh_token TEXT;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS scope TEXT;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- ── profiles ── referenced by campaign wins; standard Supabase pattern, never created
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT USING (auth.uid() = id);

-- ── Backfills for new scoping columns (derive ownership via existing FKs) ──
UPDATE projects p SET user_id = cl.user_id
  FROM clients cl WHERE p.client_id = cl.id AND p.user_id IS NULL;

UPDATE campaigns ca SET user_id = cl.user_id
  FROM projects p JOIN clients cl ON cl.id = p.client_id
  WHERE ca.project_id = p.id AND ca.user_id IS NULL;

UPDATE call_lists l SET user_id = cl.user_id
  FROM projects p JOIN clients cl ON cl.id = p.client_id
  WHERE l.project_id = p.id AND l.user_id IS NULL;

UPDATE contact_sequences cs SET user_id = c.user_id
  FROM contacts c WHERE cs.contact_id = c.id AND cs.user_id IS NULL;

-- Seed profiles from auth.users so existing users resolve
INSERT INTO profiles (id, email)
  SELECT u.id, u.email FROM auth.users u
  ON CONFLICT (id) DO NOTHING;

-- Refresh PostgREST schema cache immediately
NOTIFY pgrst, 'reload schema';
