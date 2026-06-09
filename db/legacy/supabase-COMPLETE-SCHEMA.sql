-- ============================================================
-- LeadOS — COMPLETE SCHEMA (Full Recompile)
-- Generated: 2026-05-30
-- Covers: Base schema + ALL migrations through HR/Payroll
-- Safe to run from scratch on a fresh Supabase project.
-- Uses IF NOT EXISTS and ADD COLUMN IF NOT EXISTS throughout.
-- Run the ENTIRE file in Supabase SQL Editor in one paste.
-- ============================================================


-- ============================================================
-- SECTION 1: BASE TABLES
-- contacts, clients, projects, call_lists, calls, tags
-- ============================================================

CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  company TEXT,
  title TEXT,
  phone_normalized TEXT,
  email_normalized TEXT,
  status TEXT DEFAULT 'active',
  call_count INTEGER DEFAULT 0,
  last_called_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  website TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS call_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS call_list_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_list_id UUID NOT NULL REFERENCES call_lists(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  skip_count INTEGER DEFAULT 0,
  skip_limit INTEGER DEFAULT 3,
  queue_position INTEGER,
  added_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(call_list_id, contact_id)
);

CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  contact_id UUID NOT NULL REFERENCES contacts(id),
  call_list_id UUID REFERENCES call_lists(id),
  phone_number TEXT,
  call_duration_seconds INTEGER,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  recording_url TEXT,
  raw_transcript TEXT,
  summary TEXT,
  outcome TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  color TEXT DEFAULT '#888888',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS contact_tag_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES contact_tags(id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(contact_id, tag_id)
);

CREATE TABLE IF NOT EXISTS contact_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  filter_config JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Base indexes
CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone_normalized ON contacts(phone_normalized);
CREATE INDEX IF NOT EXISTS idx_contacts_email_normalized ON contacts(email_normalized);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_clients_user ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_call_lists_project ON call_lists(project_id);
CREATE INDEX IF NOT EXISTS idx_call_list_contacts_list ON call_list_contacts(call_list_id);
CREATE INDEX IF NOT EXISTS idx_call_list_contacts_contact ON call_list_contacts(contact_id);
CREATE INDEX IF NOT EXISTS idx_calls_user ON calls(user_id);
CREATE INDEX IF NOT EXISTS idx_calls_contact ON calls(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_tags_user ON contact_tags(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_tag_mappings_contact ON contact_tag_mappings(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_tag_mappings_tag ON contact_tag_mappings(tag_id);

-- Base RLS
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_list_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_tag_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_filters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contacts_select" ON contacts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "contacts_insert" ON contacts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "contacts_update" ON contacts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "contacts_delete" ON contacts FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "clients_select" ON clients FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "clients_insert" ON clients FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "clients_update" ON clients FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "clients_delete" ON clients FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "projects_all" ON projects FOR ALL USING (
  EXISTS (SELECT 1 FROM clients WHERE clients.id = projects.client_id AND clients.user_id = auth.uid())
);
CREATE POLICY "call_lists_all" ON call_lists FOR ALL USING (
  EXISTS (
    SELECT 1 FROM projects
    JOIN clients ON clients.id = projects.client_id
    WHERE projects.id = call_lists.project_id AND clients.user_id = auth.uid()
  )
);
CREATE POLICY "call_list_contacts_all" ON call_list_contacts FOR ALL USING (
  EXISTS (
    SELECT 1 FROM call_lists
    JOIN projects ON projects.id = call_lists.project_id
    JOIN clients ON clients.id = projects.client_id
    WHERE call_lists.id = call_list_contacts.call_list_id AND clients.user_id = auth.uid()
  )
);
CREATE POLICY "calls_select" ON calls FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "calls_insert" ON calls FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "calls_update" ON calls FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "tags_all" ON contact_tags FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "tag_mappings_all" ON contact_tag_mappings FOR ALL USING (
  EXISTS (SELECT 1 FROM contacts WHERE contacts.id = contact_tag_mappings.contact_id AND contacts.user_id = auth.uid())
);
CREATE POLICY "filters_all" ON contact_filters FOR ALL USING (auth.uid() = user_id);


-- ============================================================
-- SECTION 2: SETTINGS & SECURITY
-- user_settings, api_tokens, login_activity, preferences, vaults
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
  -- Working hours
  working_hours_start TEXT DEFAULT '08:00',
  working_hours_end TEXT DEFAULT '21:00',
  working_days TEXT[] DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri'],
  -- Calling rules
  call_retry_limit INTEGER DEFAULT 3,
  call_retry_interval_hours INTEGER DEFAULT 24,
  default_from_number TEXT,
  default_call_type TEXT DEFAULT 'cold_call',
  recording_compliance_message TEXT,
  recording_compliance_enabled BOOLEAN DEFAULT false,
  -- Notifications
  notify_new_leads BOOLEAN DEFAULT true,
  notify_overdue_tasks BOOLEAN DEFAULT true,
  notify_missed_calls BOOLEAN DEFAULT true,
  notify_voicemails BOOLEAN DEFAULT true,
  notify_new_deals BOOLEAN DEFAULT true,
  daily_digest_email BOOLEAN DEFAULT false,
  -- Communication
  smtp_host TEXT,
  smtp_port INTEGER DEFAULT 587,
  smtp_user TEXT,
  smtp_pass_encrypted TEXT,
  sms_auto_reply TEXT,
  email_signature TEXT,
  -- Invoice / Agency branding
  invoice_header TEXT,
  invoice_footer TEXT,
  invoice_logo_url TEXT,
  agency_name TEXT,
  agency_logo_url TEXT,
  agency_website TEXT,
  agency_phone TEXT,
  agency_address TEXT,
  -- Defaults
  auto_score_on_import BOOLEAN DEFAULT true,
  default_task_priority TEXT DEFAULT 'medium',
  data_retention_months INTEGER DEFAULT 0,
  -- Sidebar customization
  sidebar_hidden_items TEXT[] DEFAULT ARRAY[]::TEXT[],
  sidebar_item_order JSONB,
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

CREATE TABLE IF NOT EXISTS password_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  site_name TEXT NOT NULL,
  site_url TEXT,
  username TEXT,
  password_encrypted TEXT NOT NULL,
  notes TEXT,
  category TEXT DEFAULT 'general',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_key_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  service TEXT,
  key_value TEXT NOT NULL,
  environment TEXT DEFAULT 'production',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
  sidebar_items JSONB,
  theme TEXT DEFAULT 'dark',
  notification_sounds BOOLEAN DEFAULT true,
  microphone_device_id TEXT,
  speaker_device_id TEXT,
  contact_default_type TEXT DEFAULT 'lead',
  contact_required_fields TEXT[] DEFAULT ARRAY['name', 'phone'],
  agency_name TEXT,
  agency_logo_url TEXT,
  agency_website TEXT,
  agency_phone TEXT,
  agency_address TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user ON user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_login_activity_user ON login_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_login_activity_login_at ON login_activity(login_at);
CREATE INDEX IF NOT EXISTS idx_password_vault_user ON password_vault(user_id);
CREATE INDEX IF NOT EXISTS idx_api_key_vault_user ON api_key_vault(user_id);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_key_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_settings_all" ON user_settings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "api_tokens_all" ON api_tokens FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "login_activity_all" ON login_activity FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "pwd_vault_all" ON password_vault FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "api_vault_all" ON api_key_vault FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "prefs_all" ON user_preferences FOR ALL USING (auth.uid() = user_id);


-- ============================================================
-- SECTION 3: ANALYTICS
-- api_usage_log, user_sessions, dialer_activity
-- ============================================================

CREATE TABLE IF NOT EXISTS api_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  call_id UUID NOT NULL REFERENCES calls(id),
  twilio_duration_minutes INTEGER DEFAULT 0,
  twilio_cost DECIMAL(10,4) DEFAULT 0,
  groq_cost DECIMAL(10,6) DEFAULT 0,
  claude_input_tokens INTEGER DEFAULT 0,
  claude_output_tokens INTEGER DEFAULT 0,
  claude_cost DECIMAL(10,4) DEFAULT 0,
  total_cost DECIMAL(10,4) DEFAULT 0,
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
  campaign_id UUID,  -- FK added after campaigns table
  activity_type TEXT,
  activity_start TIMESTAMP DEFAULT NOW(),
  activity_end TIMESTAMP,
  duration_seconds INTEGER,
  call_id UUID REFERENCES calls(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_user ON api_usage_log(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_call ON api_usage_log(call_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage_log(created_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_dialer_activity_user ON dialer_activity(user_id);

ALTER TABLE api_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dialer_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usage_log_all" ON api_usage_log FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "sessions_all" ON user_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "activity_all" ON dialer_activity FOR ALL USING (auth.uid() = user_id);


-- ============================================================
-- SECTION 4: CAMPAIGNS
-- campaigns, update call_lists with campaign_id
-- ============================================================

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE call_lists ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE;
ALTER TABLE dialer_activity ADD COLUMN IF NOT EXISTS campaign_fk UUID REFERENCES campaigns(id);

CREATE INDEX IF NOT EXISTS idx_campaigns_project ON campaigns(project_id);
CREATE INDEX IF NOT EXISTS idx_call_lists_campaign ON call_lists(campaign_id);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaigns_all" ON campaigns FOR ALL USING (
  EXISTS (
    SELECT 1 FROM projects
    JOIN clients ON clients.id = projects.client_id
    WHERE projects.id = campaigns.project_id AND clients.user_id = auth.uid()
  )
);


-- ============================================================
-- SECTION 5: REPORTS & INVOICES
-- generated_reports, invoices
-- ============================================================

CREATE TABLE IF NOT EXISTS generated_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_id UUID REFERENCES clients(id),
  project_id UUID REFERENCES projects(id),
  campaign_id UUID REFERENCES campaigns(id),
  report_type TEXT NOT NULL,
  report_title TEXT NOT NULL,
  date_from DATE,
  date_to DATE,
  content TEXT,
  html_content TEXT,
  status TEXT DEFAULT 'draft',
  share_token TEXT UNIQUE,
  share_expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_id UUID REFERENCES clients(id),
  report_id UUID REFERENCES generated_reports(id),
  invoice_number TEXT,
  invoice_date DATE,
  due_date DATE,
  hours_worked DECIMAL(10,2),
  hourly_rate DECIMAL(10,2),
  subtotal DECIMAL(12,2),
  tax_percent DECIMAL(5,2) DEFAULT 0,
  tax_amount DECIMAL(12,2),
  total DECIMAL(12,2),
  status TEXT DEFAULT 'draft',
  paid_at TIMESTAMP,
  payment_method TEXT,
  payment_notes TEXT,
  bank_name TEXT,
  routing_number TEXT,
  account_number TEXT,
  account_type TEXT DEFAULT 'checking',
  payment_memo TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_user ON generated_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_client ON generated_reports(client_id);
CREATE INDEX IF NOT EXISTS idx_reports_share_token ON generated_reports(share_token);
CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id);

ALTER TABLE generated_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reports_all" ON generated_reports FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "invoices_all" ON invoices FOR ALL USING (auth.uid() = user_id);


-- ============================================================
-- SECTION 6: PHONE SYSTEM
-- phone_numbers, voicemails, missed_calls
-- ============================================================

CREATE TABLE IF NOT EXISTS phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  phone_number TEXT NOT NULL,
  twilio_phone_sid TEXT,
  friendly_name TEXT,
  client_id UUID REFERENCES clients(id),
  campaign_id UUID REFERENCES campaigns(id),
  status TEXT DEFAULT 'active',
  is_primary BOOLEAN DEFAULT false,
  voicemail_greeting TEXT,
  record_incoming BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, phone_number)
);

CREATE TABLE IF NOT EXISTS voicemails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  phone_number_id UUID REFERENCES phone_numbers(id),
  caller_id TEXT NOT NULL,
  caller_name TEXT,
  duration_seconds INTEGER,
  recording_url TEXT,
  transcript TEXT,
  status TEXT DEFAULT 'unread',
  received_at TIMESTAMP DEFAULT NOW(),
  listened_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS missed_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  phone_number_id UUID REFERENCES phone_numbers(id),
  caller_id TEXT NOT NULL,
  caller_name TEXT,
  call_duration_seconds INTEGER DEFAULT 0,
  returned BOOLEAN DEFAULT false,
  returned_at TIMESTAMP,
  notes TEXT,
  received_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phone_numbers_user ON phone_numbers(user_id);
CREATE INDEX IF NOT EXISTS idx_voicemails_user ON voicemails(user_id);
CREATE INDEX IF NOT EXISTS idx_voicemails_status ON voicemails(status) WHERE status = 'unread';
CREATE INDEX IF NOT EXISTS idx_missed_calls_user ON missed_calls(user_id);
CREATE INDEX IF NOT EXISTS idx_missed_calls_returned ON missed_calls(returned) WHERE returned = false;

ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE voicemails ENABLE ROW LEVEL SECURITY;
ALTER TABLE missed_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "phone_numbers_all" ON phone_numbers FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "voicemails_all" ON voicemails FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "missed_calls_all" ON missed_calls FOR ALL USING (auth.uid() = user_id);


-- ============================================================
-- SECTION 7: TWILIO + CALL EXTENSIONS
-- ============================================================

ALTER TABLE calls ADD COLUMN IF NOT EXISTS twilio_call_sid TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_type TEXT DEFAULT 'cold_call';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS script_id UUID;  -- FK added after scripts table
ALTER TABLE calls ADD COLUMN IF NOT EXISTS quality_score INTEGER;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS quality_breakdown TEXT;

CREATE INDEX IF NOT EXISTS idx_calls_twilio_sid ON calls(twilio_call_sid);
CREATE INDEX IF NOT EXISTS idx_calls_type ON calls(call_type);
CREATE INDEX IF NOT EXISTS idx_calls_created ON calls(created_at);
CREATE INDEX IF NOT EXISTS idx_calls_outcome ON calls(outcome);


-- ============================================================
-- SECTION 8: TIME TRACKING
-- time_entries
-- ============================================================

CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_id UUID REFERENCES clients(id),
  project_id UUID REFERENCES projects(id),
  campaign_id UUID REFERENCES campaigns(id),
  description TEXT,
  duration_minutes INTEGER NOT NULL,
  billable BOOLEAN DEFAULT true,
  hourly_rate DECIMAL(10,2),
  entry_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_project ON time_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(entry_date);

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "time_entries_all" ON time_entries FOR ALL USING (auth.uid() = user_id);


-- ============================================================
-- SECTION 9: SCRIPTS & TEAM
-- scripts, script_objections, campaign_goals, client_knowledge, team_members
-- ============================================================

CREATE TABLE IF NOT EXISTS scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_id UUID REFERENCES clients(id),
  campaign_id UUID REFERENCES campaigns(id),
  title TEXT NOT NULL,
  opener TEXT,
  elevator_pitch TEXT,
  discovery TEXT,
  closing TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS script_objections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  objection TEXT NOT NULL,
  response TEXT NOT NULL,
  follow_up TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS script_objection_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  script_id UUID NOT NULL REFERENCES scripts(id),
  objection_id UUID NOT NULL REFERENCES script_objections(id),
  logged_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  goal_type TEXT NOT NULL,
  target_value DECIMAL(10,2) NOT NULL,
  period TEXT DEFAULT 'daily',
  UNIQUE(campaign_id, goal_type, period)
);

CREATE TABLE IF NOT EXISTS client_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  knowledge_type TEXT DEFAULT 'general',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id),
  member_email TEXT NOT NULL,
  member_user_id UUID REFERENCES auth.users(id),
  role TEXT DEFAULT 'agent',
  status TEXT DEFAULT 'pending',
  invited_at TIMESTAMP DEFAULT NOW(),
  accepted_at TIMESTAMP,
  -- HR fields
  first_name TEXT,
  last_name TEXT,
  title TEXT,
  department TEXT,
  hire_date DATE,
  start_date DATE,
  end_date DATE,
  contract_type TEXT DEFAULT 'full_time',
  pay_rate DECIMAL(10,2),
  pay_type TEXT DEFAULT 'salary',
  pay_frequency TEXT DEFAULT 'bi_weekly',
  phone TEXT,
  address TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  quota_monthly DECIMAL(12,2),
  commission_rate DECIMAL(5,2),
  notes TEXT,
  avatar_url TEXT,
  UNIQUE(owner_user_id, member_email)
);

-- Wire FK now that scripts table exists
ALTER TABLE calls ADD COLUMN IF NOT EXISTS script_id_fk UUID REFERENCES scripts(id);

CREATE INDEX IF NOT EXISTS idx_scripts_user ON scripts(user_id);
CREATE INDEX IF NOT EXISTS idx_scripts_client ON scripts(client_id);
CREATE INDEX IF NOT EXISTS idx_script_objections_script ON script_objections(script_id);
CREATE INDEX IF NOT EXISTS idx_objection_logs_call ON script_objection_logs(call_id);
CREATE INDEX IF NOT EXISTS idx_objection_logs_script ON script_objection_logs(script_id);
CREATE INDEX IF NOT EXISTS idx_calls_script ON calls(script_id);
CREATE INDEX IF NOT EXISTS idx_campaign_goals_campaign ON campaign_goals(campaign_id);
CREATE INDEX IF NOT EXISTS idx_client_knowledge_client ON client_knowledge(client_id);
CREATE INDEX IF NOT EXISTS idx_team_members_owner ON team_members(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_member ON team_members(member_user_id);

ALTER TABLE scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE script_objections ENABLE ROW LEVEL SECURITY;
ALTER TABLE script_objection_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scripts_all" ON scripts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "objections_all" ON script_objections FOR ALL USING (
  EXISTS (SELECT 1 FROM scripts WHERE scripts.id = script_objections.script_id AND scripts.user_id = auth.uid())
);
CREATE POLICY "obj_logs_all" ON script_objection_logs FOR ALL USING (
  EXISTS (SELECT 1 FROM calls WHERE calls.id = script_objection_logs.call_id AND calls.user_id = auth.uid())
);
CREATE POLICY "goals_all" ON campaign_goals FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "knowledge_all" ON client_knowledge FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "team_owner" ON team_members FOR ALL USING (auth.uid() = owner_user_id);
CREATE POLICY "team_member_read" ON team_members FOR SELECT USING (auth.uid() = member_user_id);


-- ============================================================
-- SECTION 10: LEAD SCRAPER & ENRICHMENT
-- ============================================================

CREATE TABLE IF NOT EXISTS scraped_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  source TEXT,
  source_url TEXT,
  raw_name TEXT,
  raw_email TEXT,
  raw_phone TEXT,
  raw_title TEXT,
  raw_company TEXT,
  confidence DECIMAL(3,2) DEFAULT 0.8,
  status TEXT DEFAULT 'pending',
  contact_id UUID REFERENCES contacts(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_enrichments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  contact_id UUID NOT NULL REFERENCES contacts(id),
  company_summary TEXT,
  outreach_angle TEXT,
  personalized_message TEXT,
  talking_points TEXT,
  enriched_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scraped_contacts_user ON scraped_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_scraped_contacts_status ON scraped_contacts(status);
CREATE INDEX IF NOT EXISTS idx_enrichments_contact ON contact_enrichments(contact_id);

ALTER TABLE scraped_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_enrichments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scraped_all" ON scraped_contacts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "enrichments_all" ON contact_enrichments FOR ALL USING (auth.uid() = user_id);


-- ============================================================
-- SECTION 11: EXTENDED CONTACT FIELDS
-- ============================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS contact_type TEXT DEFAULT 'lead';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_source TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_business BOOLEAN DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS customer_since DATE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS do_not_email BOOLEAN DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS contact_score INTEGER DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS score_updated_at TIMESTAMP;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS flagged_own_pipeline BOOLEAN DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS own_pipeline_notes TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS own_pipeline_product TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS own_pipeline_flagged_at TIMESTAMP;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS import_batch_id UUID;  -- FK added after import_batches

CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts(contact_type);
CREATE INDEX IF NOT EXISTS idx_contacts_source ON contacts(lead_source);
CREATE INDEX IF NOT EXISTS idx_contacts_score ON contacts(contact_score);
CREATE INDEX IF NOT EXISTS idx_contacts_own_pipeline ON contacts(flagged_own_pipeline) WHERE flagged_own_pipeline = true;
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company) WHERE company IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_email_norm ON contacts(email_normalized) WHERE email_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_last_called ON contacts(last_called_at) WHERE last_called_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_created ON contacts(created_at);


-- ============================================================
-- SECTION 12: LEADS, TASKS, EMAIL LOGS
-- lead_sources, tasks, email_logs
-- ============================================================

CREATE TABLE IF NOT EXISTS lead_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  source_type TEXT DEFAULT 'webhook',
  client_id UUID REFERENCES clients(id),
  project_id UUID REFERENCES projects(id),
  campaign_id UUID REFERENCES campaigns(id),
  auto_call_list_id UUID REFERENCES call_lists(id),
  webhook_token TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::TEXT,
  default_contact_type TEXT DEFAULT 'lead',
  lead_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  contact_id UUID REFERENCES contacts(id),
  call_id UUID REFERENCES calls(id),
  campaign_id UUID REFERENCES campaigns(id),
  assigned_to UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT DEFAULT 'follow_up',
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'pending',
  due_date TIMESTAMP,
  completed_at TIMESTAMP,
  ai_suggested BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  contact_id UUID REFERENCES contacts(id),
  call_id UUID REFERENCES calls(id),
  task_id UUID REFERENCES tasks(id),
  subject TEXT,
  body TEXT NOT NULL,
  email_type TEXT DEFAULT 'follow_up',
  status TEXT DEFAULT 'draft',
  generated_by TEXT DEFAULT 'manual',
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_sources_user ON lead_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_sources_token ON lead_sources(webhook_token);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_contact ON tasks(contact_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_due_status ON tasks(due_date, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_email_logs_user ON email_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_contact ON email_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_created ON email_logs(created_at);

ALTER TABLE lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_sources_all" ON lead_sources FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "tasks_all" ON tasks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "email_logs_all" ON email_logs FOR ALL USING (auth.uid() = user_id);


-- ============================================================
-- SECTION 13: SALES FEATURES
-- voicemail_drops, sms_logs, deals
-- ============================================================

CREATE TABLE IF NOT EXISTS voicemail_drops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  audio_url TEXT,
  duration_seconds INTEGER,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  contact_id UUID REFERENCES contacts(id),
  phone_number_id UUID REFERENCES phone_numbers(id),
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  body TEXT NOT NULL,
  direction TEXT NOT NULL,
  status TEXT DEFAULT 'sent',
  twilio_sid TEXT,
  sent_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  contact_id UUID REFERENCES contacts(id),
  client_id UUID REFERENCES clients(id),
  campaign_id UUID REFERENCES campaigns(id),
  title TEXT NOT NULL,
  value DECIMAL(12,2) DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'prospect',
  probability INTEGER DEFAULT 20,
  expected_close DATE,
  notes TEXT,
  lost_reason TEXT,
  won_at TIMESTAMP,
  lost_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voicemail_drops_user ON voicemail_drops(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_user ON sms_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_contact ON sms_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_sms_sent_at ON sms_logs(sent_at);
CREATE INDEX IF NOT EXISTS idx_deals_user ON deals(user_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
CREATE INDEX IF NOT EXISTS idx_deals_contact ON deals(contact_id);
CREATE INDEX IF NOT EXISTS idx_deals_created ON deals(created_at);
CREATE INDEX IF NOT EXISTS idx_deals_won_at ON deals(won_at) WHERE won_at IS NOT NULL;

ALTER TABLE voicemail_drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vm_drops_all" ON voicemail_drops FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "sms_logs_all" ON sms_logs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "deals_all" ON deals FOR ALL USING (auth.uid() = user_id);


-- ============================================================
-- SECTION 14: SEQUENCES, AUTOMATIONS, CUSTOM FIELDS
-- email_sequences, automation_rules, contact_field_definitions/values
-- ============================================================

CREATE TABLE IF NOT EXISTS email_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT DEFAULT 'manual',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES email_sequences(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  delay_days INTEGER DEFAULT 0,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  email_type TEXT DEFAULT 'follow_up'
);

CREATE TABLE IF NOT EXISTS contact_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL REFERENCES email_sequences(id),
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  started_at TIMESTAMP DEFAULT NOW(),
  next_step_at TIMESTAMP,
  UNIQUE(contact_id, sequence_id)
);

CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  conditions JSONB DEFAULT '[]',
  actions JSONB DEFAULT '[]',
  enabled BOOLEAN DEFAULT true,
  run_count INTEGER DEFAULT 0,
  last_run_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  field_key TEXT NOT NULL,
  field_type TEXT DEFAULT 'text',
  options JSONB,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, field_key)
);

CREATE TABLE IF NOT EXISTS contact_field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  field_definition_id UUID NOT NULL REFERENCES contact_field_definitions(id) ON DELETE CASCADE,
  value TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(contact_id, field_definition_id)
);

CREATE INDEX IF NOT EXISTS idx_sequences_user ON email_sequences(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_sequences_contact ON contact_sequences(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_sequences_next ON contact_sequences(next_step_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_automation_rules_user ON automation_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_field_defs_user ON contact_field_definitions(user_id);
CREATE INDEX IF NOT EXISTS idx_field_values_contact ON contact_field_values(contact_id);

ALTER TABLE email_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_field_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sequences_all" ON email_sequences FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "seq_steps_all" ON sequence_steps FOR ALL USING (
  EXISTS (SELECT 1 FROM email_sequences WHERE id = sequence_steps.sequence_id AND user_id = auth.uid())
);
CREATE POLICY "contact_seqs_all" ON contact_sequences FOR ALL USING (
  EXISTS (SELECT 1 FROM contacts WHERE id = contact_sequences.contact_id AND user_id = auth.uid())
);
CREATE POLICY "automations_all" ON automation_rules FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "field_defs_all" ON contact_field_definitions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "field_values_all" ON contact_field_values FOR ALL USING (
  EXISTS (SELECT 1 FROM contacts WHERE id = contact_field_values.contact_id AND user_id = auth.uid())
);


-- ============================================================
-- SECTION 15: CRM FEATURES
-- quotas, snippets, templates, contact_documents, outbound_webhooks
-- ============================================================

CREATE TABLE IF NOT EXISTS quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  quota_type TEXT NOT NULL DEFAULT 'calls',
  target_value DECIMAL(12,2) NOT NULL,
  period TEXT NOT NULL DEFAULT 'monthly',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, quota_type, period_start)
);

CREATE TABLE IF NOT EXISTS snippets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  trigger TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, trigger)
);

CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'email',
  category TEXT DEFAULT 'general',
  subject TEXT,
  body TEXT NOT NULL,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  document_category TEXT DEFAULT 'general',
  storage_path TEXT,
  tags TEXT[],
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outbound_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT[] DEFAULT ARRAY['lead_arrived'],
  secret TEXT,
  enabled BOOLEAN DEFAULT true,
  delivery_count INTEGER DEFAULT 0,
  last_delivered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quotas_user ON quotas(user_id);
CREATE INDEX IF NOT EXISTS idx_snippets_user ON snippets(user_id);
CREATE INDEX IF NOT EXISTS idx_templates_user ON templates(user_id);
CREATE INDEX IF NOT EXISTS idx_templates_type ON templates(type);
CREATE INDEX IF NOT EXISTS idx_contact_docs_contact ON contact_documents(contact_id);
CREATE INDEX IF NOT EXISTS idx_docs_category ON contact_documents(document_category);
CREATE INDEX IF NOT EXISTS idx_outbound_webhooks_user ON outbound_webhooks(user_id);

ALTER TABLE quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE snippets ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotas_all" ON quotas FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "snippets_all" ON snippets FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "templates_all" ON templates FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "docs_all" ON contact_documents FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "webhooks_all" ON outbound_webhooks FOR ALL USING (auth.uid() = user_id);


-- ============================================================
-- SECTION 16: IMPORT SYSTEM
-- import_batches, wire FK to contacts
-- ============================================================

CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  filename TEXT,
  source TEXT DEFAULT 'csv',
  mode TEXT DEFAULT 'create',
  total_created INTEGER DEFAULT 0,
  total_updated INTEGER DEFAULT 0,
  total_skipped INTEGER DEFAULT 0,
  can_undo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS import_batch_id_fk UUID REFERENCES import_batches(id);

CREATE INDEX IF NOT EXISTS idx_contacts_batch ON contacts(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_user ON import_batches(user_id);

ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "batches_all" ON import_batches FOR ALL USING (auth.uid() = user_id);


-- ============================================================
-- SECTION 17: FINANCIALS
-- balance_entries, tech_stack_items, budget_entries
-- ============================================================

CREATE TABLE IF NOT EXISTS balance_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  entry_date DATE NOT NULL,
  income DECIMAL(12,2) DEFAULT 0,
  expenses DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, entry_date)
);

CREATE TABLE IF NOT EXISTS tech_stack_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  category TEXT DEFAULT 'other',
  monthly_cost DECIMAL(10,2) DEFAULT 0,
  billing_cycle TEXT DEFAULT 'monthly',
  url TEXT,
  notes TEXT,
  project_ids UUID[] DEFAULT '{}',
  campaign_ids UUID[] DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS budget_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  entry_type TEXT NOT NULL,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  frequency TEXT DEFAULT 'monthly',
  entry_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_balance_entries_user ON balance_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_balance_entries_date ON balance_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_tech_stack_user ON tech_stack_items(user_id);
CREATE INDEX IF NOT EXISTS idx_tech_stack_active ON tech_stack_items(user_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_budget_entries_user ON budget_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_entries_type ON budget_entries(entry_type);

ALTER TABLE balance_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tech_stack_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "balance_entries_all" ON balance_entries FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "tech_stack_all" ON tech_stack_items FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "budget_entries_all" ON budget_entries FOR ALL USING (auth.uid() = user_id);


-- ============================================================
-- SECTION 18: STACK MANAGER
-- stack_accounts — full service account tracking with credential linking
-- ============================================================

CREATE TABLE IF NOT EXISTS stack_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  service_name TEXT NOT NULL,
  service_category TEXT DEFAULT 'other',
  service_url TEXT,
  service_icon TEXT,
  login_email TEXT,
  login_username TEXT,
  password_vault_id UUID REFERENCES password_vault(id) ON DELETE SET NULL,
  api_key_vault_id UUID REFERENCES api_key_vault(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'active',
  trial_start DATE,
  trial_end DATE,
  auto_renew BOOLEAN DEFAULT true,
  cost DECIMAL(10,2) DEFAULT 0,
  billing_cycle TEXT DEFAULT 'monthly',
  next_billing_date DATE,
  payment_method_label TEXT,
  annual_cost DECIMAL(10,2),
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stack_accounts_user ON stack_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_stack_accounts_status ON stack_accounts(status);
CREATE INDEX IF NOT EXISTS idx_stack_accounts_trial_end ON stack_accounts(trial_end) WHERE trial_end IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stack_accounts_billing ON stack_accounts(next_billing_date) WHERE next_billing_date IS NOT NULL;

ALTER TABLE stack_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stack_accounts_all" ON stack_accounts FOR ALL USING (auth.uid() = user_id);


-- ============================================================
-- SECTION 19: MARKETING
-- marketing_assets, social_platform_accounts, social_posts, ad_campaigns_ext
-- ============================================================

CREATE TABLE IF NOT EXISTS marketing_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  asset_type TEXT DEFAULT 'image',
  source TEXT DEFAULT 'upload',
  file_url TEXT,
  thumbnail_url TEXT,
  canva_design_id TEXT,
  canva_edit_url TEXT,
  prompt TEXT,
  width INTEGER,
  height INTEGER,
  format TEXT,
  platform TEXT,
  status TEXT DEFAULT 'draft',
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_platform_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  account_name TEXT,
  account_handle TEXT,
  account_url TEXT,
  followers INTEGER DEFAULT 0,
  following INTEGER DEFAULT 0,
  access_token_vault_id UUID REFERENCES api_key_vault(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'connected',
  last_synced_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, client_id, platform)
);

CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  platform_account_id UUID REFERENCES social_platform_accounts(id) ON DELETE SET NULL,
  asset_id UUID REFERENCES marketing_assets(id) ON DELETE SET NULL,
  caption TEXT,
  hashtags TEXT,
  platforms TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'draft',
  scheduled_at TIMESTAMP,
  published_at TIMESTAMP,
  post_url TEXT,
  external_post_id TEXT,
  engagement_likes INTEGER DEFAULT 0,
  engagement_comments INTEGER DEFAULT 0,
  engagement_shares INTEGER DEFAULT 0,
  engagement_reach INTEGER DEFAULT 0,
  notes TEXT,
  ai_generated BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ad_campaigns_ext (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  lead_campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  campaign_type TEXT DEFAULT 'awareness',
  status TEXT DEFAULT 'active',
  budget DECIMAL(10,2),
  budget_period TEXT DEFAULT 'monthly',
  spent DECIMAL(10,2) DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  leads INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  ctr DECIMAL(6,4),
  cpc DECIMAL(10,4),
  cpl DECIMAL(10,2),
  roas DECIMAL(10,2),
  start_date DATE,
  end_date DATE,
  ad_account_id TEXT,
  external_campaign_id TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_assets_user ON marketing_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_marketing_assets_client ON marketing_assets(client_id);
CREATE INDEX IF NOT EXISTS idx_social_platform_accounts_user ON social_platform_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_user ON social_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_scheduled ON social_posts(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_ext_user ON ad_campaigns_ext(user_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_ext_client ON ad_campaigns_ext(client_id);

ALTER TABLE marketing_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_platform_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_campaigns_ext ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketing_assets_all" ON marketing_assets FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "social_accounts_all" ON social_platform_accounts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "social_posts_all" ON social_posts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "ad_campaigns_ext_all" ON ad_campaigns_ext FOR ALL USING (auth.uid() = user_id);


-- ============================================================
-- SECTION 20: HR, PAYROLL, SLACK & TEAMS INTEGRATIONS
-- payroll_entries, slack_integrations, teams_integrations
-- ============================================================

CREATE TABLE IF NOT EXISTS payroll_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
  member_email TEXT,
  pay_period_start DATE NOT NULL,
  pay_period_end DATE NOT NULL,
  base_pay DECIMAL(10,2) DEFAULT 0,
  commission DECIMAL(10,2) DEFAULT 0,
  bonuses DECIMAL(10,2) DEFAULT 0,
  deductions DECIMAL(10,2) DEFAULT 0,
  net_pay DECIMAL(10,2) GENERATED ALWAYS AS (base_pay + commission + bonuses - deductions) STORED,
  status TEXT DEFAULT 'pending',
  paid_at TIMESTAMP,
  payment_method TEXT DEFAULT 'ach',
  reference TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS slack_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
  workspace_name TEXT,
  bot_token_vault_id UUID REFERENCES api_key_vault(id),
  default_channel TEXT DEFAULT '#general',
  webhook_url TEXT,
  notify_new_leads BOOLEAN DEFAULT true,
  notify_calls BOOLEAN DEFAULT false,
  notify_deals BOOLEAN DEFAULT false,
  notify_tasks BOOLEAN DEFAULT false,
  connected_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teams_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
  webhook_url TEXT NOT NULL,
  channel_name TEXT,
  notify_new_leads BOOLEAN DEFAULT true,
  notify_calls BOOLEAN DEFAULT false,
  notify_deals BOOLEAN DEFAULT false,
  connected_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_entries_user ON payroll_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_member ON payroll_entries(team_member_id);
CREATE INDEX IF NOT EXISTS idx_payroll_entries_status ON payroll_entries(status);

ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE slack_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_entries_all" ON payroll_entries FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "slack_integrations_all" ON slack_integrations FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "teams_integrations_all" ON teams_integrations FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- END OF COMPLETE SCHEMA
-- Table count: 50 tables
-- All RLS enabled, all indexes created
-- Safe to run on fresh Supabase project
-- ============================================================
