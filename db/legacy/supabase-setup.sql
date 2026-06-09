-- ============================================================
-- LeadOS — Complete Supabase Setup
-- Safe to run multiple times (IF NOT EXISTS everywhere)
-- Last updated: June 2026
-- ============================================================


-- ── MESSAGING SYSTEM ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS message_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL,
  name TEXT NOT NULL,
  channel_type TEXT NOT NULL DEFAULT 'campaign',
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS channel_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES message_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_role TEXT NOT NULL,
  last_read_at TIMESTAMPTZ,
  UNIQUE(channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES message_channels(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id),
  sender_role TEXT NOT NULL,
  sender_name TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ── ENGAGEMENTS (compensation per client) ────────────────────

CREATE TABLE IF NOT EXISTS engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sdr_user_id UUID REFERENCES auth.users(id),
  base_fee INTEGER NOT NULL DEFAULT 0,
  bonus_rate INTEGER NOT NULL DEFAULT 50,
  billing_day INTEGER DEFAULT 1,
  notes TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_user_id, client_id, sdr_user_id)
);


-- ── APPOINTMENT SYSTEM ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS appointment_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Appointment',
  duration_minutes INTEGER DEFAULT 30,
  default_format TEXT DEFAULT 'phone',
  questions JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_user_id, campaign_id)
);

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL,
  call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ,
  duration_minutes INTEGER DEFAULT 30,
  format TEXT DEFAULT 'phone',
  location TEXT,
  meeting_link TEXT,
  notes TEXT,
  qualifying_answers JSONB DEFAULT '{}',
  status TEXT DEFAULT 'scheduled',
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ── CAMPAIGN CONTACTS (direct join) ──────────────────────────

CREATE TABLE IF NOT EXISTS campaign_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  last_called_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, contact_id)
);


-- ── CAMPAIGN SDR ASSIGNMENT ───────────────────────────────────

CREATE TABLE IF NOT EXISTS campaign_sdrs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  sdr_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, sdr_id)
);


-- ── CLIENT DOCS PORTAL ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  doc_type TEXT DEFAULT 'file',
  description TEXT,
  file_size INTEGER,
  is_visible_to_client BOOLEAN DEFAULT TRUE,
  from_client BOOLEAN DEFAULT FALSE,
  submitted_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ── REP MARKETPLACE PROFILES ─────────────────────────────────

CREATE TABLE IF NOT EXISTS rep_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  username TEXT UNIQUE,
  display_name TEXT,
  bio TEXT,
  location TEXT,
  specialties TEXT[] DEFAULT '{}',
  hourly_rate INTEGER,
  availability TEXT DEFAULT 'available',
  interview_score INTEGER,
  interview_completed_at TIMESTAMPTZ,
  roleplay_unlocked BOOLEAN DEFAULT FALSE,
  roleplay_score INTEGER,
  is_public BOOLEAN DEFAULT FALSE,
  years_experience INTEGER,
  previous_roles TEXT,
  top_achievement TEXT,
  certifications TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rep_interview_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  recording_url TEXT,
  transcript TEXT,
  score INTEGER,
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, question_index)
);

CREATE TABLE IF NOT EXISTS rep_supercut_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
  clip_type TEXT NOT NULL,
  start_seconds INTEGER,
  end_seconds INTEGER,
  recording_url TEXT,
  transcript_excerpt TEXT,
  ai_reason TEXT,
  is_featured BOOLEAN DEFAULT FALSE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rep_testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  client_company TEXT,
  client_title TEXT,
  content TEXT NOT NULL,
  rating INTEGER DEFAULT 5,
  approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ── CONTACT INQUIRIES (from /contact hire page) ───────────────

CREATE TABLE IF NOT EXISTS contact_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  vertical TEXT,
  budget TEXT,
  message TEXT,
  source TEXT DEFAULT 'contact_page',
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ── ALTER EXISTING TABLES (all idempotent) ────────────────────

-- Team member permissions
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}';

-- Client docs: client upload fields
ALTER TABLE client_docs
  ADD COLUMN IF NOT EXISTS from_client BOOLEAN DEFAULT FALSE;
ALTER TABLE client_docs
  ADD COLUMN IF NOT EXISTS submitted_by_name TEXT;

-- Rep profiles: work history fields
ALTER TABLE rep_profiles
  ADD COLUMN IF NOT EXISTS years_experience INTEGER;
ALTER TABLE rep_profiles
  ADD COLUMN IF NOT EXISTS previous_roles TEXT;
ALTER TABLE rep_profiles
  ADD COLUMN IF NOT EXISTS top_achievement TEXT;
ALTER TABLE rep_profiles
  ADD COLUMN IF NOT EXISTS certifications TEXT[] DEFAULT '{}';

-- Supercut curation
ALTER TABLE rep_supercut_clips
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;
ALTER TABLE rep_supercut_clips
  ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- Campaign contacts: last called tracking
ALTER TABLE campaign_contacts
  ADD COLUMN IF NOT EXISTS last_called_at TIMESTAMPTZ;


-- ── INDEXES ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_messages_channel
  ON messages(channel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_channel_participants_user
  ON channel_participants(user_id);

CREATE INDEX IF NOT EXISTS idx_rep_profiles_username
  ON rep_profiles(username);

CREATE INDEX IF NOT EXISTS idx_rep_profiles_public
  ON rep_profiles(is_public);

CREATE INDEX IF NOT EXISTS idx_rep_interview_user
  ON rep_interview_answers(user_id);

CREATE INDEX IF NOT EXISTS idx_rep_supercut_user
  ON rep_supercut_clips(user_id);

CREATE INDEX IF NOT EXISTS idx_campaign_sdrs_campaign
  ON campaign_sdrs(campaign_id);

CREATE INDEX IF NOT EXISTS idx_campaign_sdrs_sdr
  ON campaign_sdrs(sdr_id);

CREATE INDEX IF NOT EXISTS idx_client_docs_client
  ON client_docs(client_id);

CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign
  ON campaign_contacts(campaign_id);

CREATE INDEX IF NOT EXISTS idx_appointments_contact
  ON appointments(contact_id);

CREATE INDEX IF NOT EXISTS idx_appointments_owner
  ON appointments(owner_user_id, scheduled_at);
