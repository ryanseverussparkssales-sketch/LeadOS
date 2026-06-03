-- ============================================================
-- LeadOS — CONSOLIDATED PENDING MIGRATIONS
-- Run this ENTIRE file in Supabase SQL Editor
-- Safe to run multiple times (uses IF NOT EXISTS throughout)
-- Last updated: 2026-05-30 — ALL migrations through Financials
-- ============================================================


-- ============================================================
-- FROM: supabase-migration-analytics.sql
-- ============================================================
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


-- ============================================================
-- FROM: supabase-migration-campaigns.sql
-- ============================================================
-- ============================================================
-- LeadOS — Campaigns Migration
-- Run this in Supabase SQL Editor AFTER the initial schema
-- Adds: campaigns table between projects and call_lists
-- Hierarchy: Client → Project → Campaign → Call List → Contacts
-- ============================================================

-- 1. Create campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Add campaign_id to call_lists (nullable for migration)
ALTER TABLE call_lists ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE;

-- 3. RLS for campaigns
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaigns_all" ON campaigns FOR ALL USING (
  EXISTS (
    SELECT 1 FROM projects
    JOIN clients ON clients.id = projects.client_id
    WHERE projects.id = campaigns.project_id AND clients.user_id = auth.uid()
  )
);

-- 4. Index
CREATE INDEX IF NOT EXISTS idx_campaigns_project ON campaigns(project_id);
CREATE INDEX IF NOT EXISTS idx_call_lists_campaign ON call_lists(campaign_id);

-- ============================================================
-- IF STARTING FRESH (no real data yet) — run this block too
-- to make campaign_id required on call_lists:
-- ============================================================
-- ALTER TABLE call_lists ALTER COLUMN campaign_id SET NOT NULL;
-- ALTER TABLE call_lists DROP COLUMN IF EXISTS project_id;
-- (Only run these if you have no call list data you need to keep)


-- ============================================================
-- FROM: supabase-migration-reports.sql
-- ============================================================
-- ============================================================
-- LeadOS — Reports & Invoices Migration
-- Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS generated_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_id UUID REFERENCES clients(id),
  project_id UUID REFERENCES projects(id),
  campaign_id UUID REFERENCES campaigns(id),
  report_type TEXT NOT NULL, -- action_report | invoice | custom
  report_title TEXT NOT NULL,
  date_from DATE,
  date_to DATE,
  content TEXT,       -- markdown
  html_content TEXT,  -- rendered HTML
  status TEXT DEFAULT 'draft',
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
  hours_worked DECIMAL(10, 2),
  hourly_rate DECIMAL(10, 2),
  subtotal DECIMAL(12, 2),
  tax_percent DECIMAL(5, 2) DEFAULT 0,
  tax_amount DECIMAL(12, 2),
  total DECIMAL(12, 2),
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reports_user ON generated_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_client ON generated_reports(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id);

-- RLS
ALTER TABLE generated_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reports_all" ON generated_reports FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "invoices_all" ON invoices FOR ALL USING (auth.uid() = user_id);


-- ============================================================
-- FROM: supabase-migration-phone-system.sql
-- ============================================================
-- ============================================================
-- LeadOS — Phone System Migration
-- ============================================================

CREATE TABLE IF NOT EXISTS phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  phone_number TEXT NOT NULL,
  twilio_phone_sid TEXT,
  friendly_name TEXT,
  client_id UUID REFERENCES clients(id),
  campaign_id UUID REFERENCES campaigns(id),
  status TEXT DEFAULT 'active',       -- active | paused | released
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
  status TEXT DEFAULT 'unread',       -- unread | read | archived
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_phone_numbers_user ON phone_numbers(user_id);
CREATE INDEX IF NOT EXISTS idx_voicemails_user ON voicemails(user_id);
CREATE INDEX IF NOT EXISTS idx_voicemails_status ON voicemails(status);
CREATE INDEX IF NOT EXISTS idx_missed_calls_user ON missed_calls(user_id);
CREATE INDEX IF NOT EXISTS idx_missed_calls_returned ON missed_calls(returned);

-- RLS
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE voicemails ENABLE ROW LEVEL SECURITY;
ALTER TABLE missed_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "phone_numbers_all" ON phone_numbers FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "voicemails_all" ON voicemails FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "missed_calls_all" ON missed_calls FOR ALL USING (auth.uid() = user_id);


-- ============================================================
-- FROM: supabase-migration-twilio.sql
-- ============================================================
-- ============================================================
-- LeadOS — Twilio Migration
-- Run in Supabase SQL Editor after the initial schema
-- ============================================================

-- Add twilio_call_sid to calls table
ALTER TABLE calls ADD COLUMN IF NOT EXISTS twilio_call_sid TEXT;
CREATE INDEX IF NOT EXISTS idx_calls_twilio_sid ON calls(twilio_call_sid);


-- ============================================================
-- FROM: supabase-migration-time-ach.sql
-- ============================================================
-- ============================================================
-- LeadOS — Time Entries + Invoice ACH Migration
-- ============================================================

-- Manual time entries
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

-- ACH fields on invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS routing_number TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS account_number TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'checking';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_memo TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_project ON time_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(entry_date);

-- RLS
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "time_entries_all" ON time_entries FOR ALL USING (auth.uid() = user_id);


-- ============================================================
-- FROM: supabase-migration-scripts.sql
-- ============================================================
-- ============================================================
-- LeadOS — Scripts, Goals & Knowledge Base Migration
-- ============================================================

-- Call scripts
CREATE TABLE IF NOT EXISTS scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_id UUID REFERENCES clients(id),     -- NULL = global (any client)
  campaign_id UUID REFERENCES campaigns(id), -- NULL = any campaign
  title TEXT NOT NULL,
  opener TEXT,           -- first words on the call
  elevator_pitch TEXT,   -- company/product pitch
  discovery TEXT,        -- discovery questions
  closing TEXT,          -- how to close/next steps
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Objection handlers per script
CREATE TABLE IF NOT EXISTS script_objections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  objection TEXT NOT NULL,        -- e.g. "We already have a solution"
  response TEXT NOT NULL,         -- what to say
  follow_up TEXT,                 -- what to pivot to next
  sort_order INTEGER DEFAULT 0
);

-- Campaign goals
CREATE TABLE IF NOT EXISTS campaign_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  goal_type TEXT NOT NULL,  -- calls_per_day | callback_rate | answer_rate | talk_time_minutes
  target_value DECIMAL(10,2) NOT NULL,
  period TEXT DEFAULT 'daily',  -- daily | weekly | monthly
  UNIQUE(campaign_id, goal_type, period)
);

-- Client knowledge base
CREATE TABLE IF NOT EXISTS client_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  knowledge_type TEXT DEFAULT 'general',  -- general | talking_points | objections | product | pricing | custom
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Team members (Owner + Team model)
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id),
  member_email TEXT NOT NULL,
  member_user_id UUID REFERENCES auth.users(id),  -- set when they accept
  role TEXT DEFAULT 'agent',  -- agent | manager
  status TEXT DEFAULT 'pending',  -- pending | active | revoked
  invited_at TIMESTAMP DEFAULT NOW(),
  accepted_at TIMESTAMP,
  UNIQUE(owner_user_id, member_email)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scripts_user ON scripts(user_id);
CREATE INDEX IF NOT EXISTS idx_scripts_client ON scripts(client_id);
CREATE INDEX IF NOT EXISTS idx_script_objections_script ON script_objections(script_id);
CREATE INDEX IF NOT EXISTS idx_campaign_goals_campaign ON campaign_goals(campaign_id);
CREATE INDEX IF NOT EXISTS idx_client_knowledge_client ON client_knowledge(client_id);
CREATE INDEX IF NOT EXISTS idx_team_members_owner ON team_members(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_member ON team_members(member_user_id);

-- RLS
ALTER TABLE scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE script_objections ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scripts_all" ON scripts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "objections_all" ON script_objections FOR ALL USING (
  EXISTS (SELECT 1 FROM scripts WHERE scripts.id = script_objections.script_id AND scripts.user_id = auth.uid())
);
CREATE POLICY "goals_all" ON campaign_goals FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "knowledge_all" ON client_knowledge FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "team_owner" ON team_members FOR ALL USING (auth.uid() = owner_user_id);
CREATE POLICY "team_member_read" ON team_members FOR SELECT USING (auth.uid() = member_user_id);


-- ============================================================
-- FROM: supabase-migration-scraper.sql
-- ============================================================
-- ============================================================
-- LeadOS — Lead Scraper Migration
-- ============================================================

CREATE TABLE IF NOT EXISTS scraped_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  source TEXT,        -- 'web_scrape' | 'screenshot' | 'manual'
  source_url TEXT,
  raw_name TEXT,
  raw_email TEXT,
  raw_phone TEXT,
  raw_title TEXT,
  raw_company TEXT,
  confidence DECIMAL(3,2) DEFAULT 0.8,
  status TEXT DEFAULT 'pending', -- pending | added | rejected
  contact_id UUID REFERENCES contacts(id), -- set when added to contacts
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
-- FROM: supabase-migration-contact-fields.sql
-- ============================================================
-- ============================================================
-- LeadOS — Enhanced Contact Fields Migration
-- ============================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS contact_type TEXT DEFAULT 'lead';
-- Values: lead | prospect | customer | partner | vendor | other

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_source TEXT;
-- Values: cold_call | csv_import | web_scrape | referral | manual | linkedin | website | trade_show | other

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_business BOOLEAN DEFAULT false;
-- B2B flag: true = business contact, false = individual

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes TEXT;
-- General notes (separate from call-specific notes)

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS customer_since DATE;
-- When this lead became a customer

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS do_not_email BOOLEAN DEFAULT false;

-- Index on contact_type and lead_source for filtering
CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts(contact_type);
CREATE INDEX IF NOT EXISTS idx_contacts_source ON contacts(lead_source);


-- ============================================================
-- FROM: supabase-migration-leads-tasks.sql
-- ============================================================
-- ============================================================
-- LeadOS — Lead Sources, Tasks & Email Logs Migration
-- ============================================================

-- Lead source webhooks (one per integration)
CREATE TABLE IF NOT EXISTS lead_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,              -- "Zapier", "Facebook Ads", "Website Form"
  source_type TEXT DEFAULT 'webhook', -- webhook | zapier | facebook | google | manual
  client_id UUID REFERENCES clients(id),
  project_id UUID REFERENCES projects(id),
  campaign_id UUID REFERENCES campaigns(id),
  auto_call_list_id UUID REFERENCES call_lists(id), -- auto-add to this list
  webhook_token TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::TEXT,
  default_contact_type TEXT DEFAULT 'lead',
  lead_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tasks / Follow-ups
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  contact_id UUID REFERENCES contacts(id),
  call_id UUID REFERENCES calls(id),
  campaign_id UUID REFERENCES campaigns(id),
  assigned_to UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT DEFAULT 'follow_up', -- follow_up | email | call | meeting | other
  priority TEXT DEFAULT 'medium',     -- low | medium | high | urgent
  status TEXT DEFAULT 'pending',      -- pending | in_progress | completed | cancelled
  due_date TIMESTAMP,
  completed_at TIMESTAMP,
  ai_suggested BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Email logs
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  contact_id UUID REFERENCES contacts(id),
  call_id UUID REFERENCES calls(id),
  task_id UUID REFERENCES tasks(id),
  subject TEXT,
  body TEXT NOT NULL,
  email_type TEXT DEFAULT 'follow_up', -- follow_up | thank_you | proposal | intro | custom
  status TEXT DEFAULT 'draft',         -- draft | sent | logged
  generated_by TEXT DEFAULT 'manual',  -- ai | manual
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lead_sources_user ON lead_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_sources_token ON lead_sources(webhook_token);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_contact ON tasks(contact_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_email_logs_user ON email_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_contact ON email_logs(contact_id);

-- RLS
ALTER TABLE lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_sources_all" ON lead_sources FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "tasks_all" ON tasks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "email_logs_all" ON email_logs FOR ALL USING (auth.uid() = user_id);


-- ============================================================
-- FROM: supabase-migration-script-tracking.sql
-- ============================================================
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


-- ============================================================
-- FROM: supabase-migration-sales-features.sql
-- ============================================================
-- ============================================================
-- LeadOS — Sales Features: Voicemail Drop, SMS, Deals
-- ============================================================

-- Pre-recorded voicemail messages for dropping
CREATE TABLE IF NOT EXISTS voicemail_drops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  audio_url TEXT,       -- hosted audio file URL
  duration_seconds INTEGER,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- SMS logs (inbound + outbound)
CREATE TABLE IF NOT EXISTS sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  contact_id UUID REFERENCES contacts(id),
  phone_number_id UUID REFERENCES phone_numbers(id),
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  body TEXT NOT NULL,
  direction TEXT NOT NULL, -- outbound | inbound
  status TEXT DEFAULT 'sent',  -- queued | sent | delivered | failed | received
  twilio_sid TEXT,
  sent_at TIMESTAMP DEFAULT NOW()
);

-- Deal pipeline
CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  contact_id UUID REFERENCES contacts(id),
  client_id UUID REFERENCES clients(id),
  campaign_id UUID REFERENCES campaigns(id),
  title TEXT NOT NULL,
  value DECIMAL(12,2) DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'prospect',
  -- Stages: prospect | qualified | demo | proposal | negotiation | won | lost
  probability INTEGER DEFAULT 20, -- 0-100%
  expected_close DATE,
  notes TEXT,
  lost_reason TEXT,
  won_at TIMESTAMP,
  lost_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_voicemail_drops_user ON voicemail_drops(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_user ON sms_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_contact ON sms_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_deals_user ON deals(user_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
CREATE INDEX IF NOT EXISTS idx_deals_contact ON deals(contact_id);

-- RLS
ALTER TABLE voicemail_drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vm_drops_all" ON voicemail_drops FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "sms_logs_all" ON sms_logs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "deals_all" ON deals FOR ALL USING (auth.uid() = user_id);


-- ============================================================
-- FROM: supabase-migration-advanced-features.sql
-- ============================================================
-- ============================================================
-- LeadOS — Advanced Features Migration
-- Activity Timeline, Sequences, Scoring, Automation, Custom Fields
-- ============================================================

-- Contact scoring
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS contact_score INTEGER DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS score_updated_at TIMESTAMP;

-- Email sequences (drip campaigns)
CREATE TABLE IF NOT EXISTS email_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT DEFAULT 'manual', -- manual | lead_arrived | call_completed | callback_outcome
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
  status TEXT DEFAULT 'active',  -- active | paused | completed | cancelled
  started_at TIMESTAMP DEFAULT NOW(),
  next_step_at TIMESTAMP,
  UNIQUE(contact_id, sequence_id)
);

-- Workflow automation rules
CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,  -- lead_arrived | call_completed | contact_updated | task_overdue
  conditions JSONB DEFAULT '[]',
  actions JSONB DEFAULT '[]',
  enabled BOOLEAN DEFAULT true,
  run_count INTEGER DEFAULT 0,
  last_run_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Custom contact field definitions
CREATE TABLE IF NOT EXISTS contact_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  field_key TEXT NOT NULL,
  field_type TEXT DEFAULT 'text',  -- text | number | date | select | boolean | url
  options JSONB,                    -- for select: ["Option A", "Option B"]
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, field_key)
);

-- Custom field values per contact
CREATE TABLE IF NOT EXISTS contact_field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  field_definition_id UUID NOT NULL REFERENCES contact_field_definitions(id) ON DELETE CASCADE,
  value TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(contact_id, field_definition_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contacts_score ON contacts(contact_score);
CREATE INDEX IF NOT EXISTS idx_sequences_user ON email_sequences(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_sequences_contact ON contact_sequences(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_sequences_next ON contact_sequences(next_step_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_automation_rules_user ON automation_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_field_defs_user ON contact_field_definitions(user_id);
CREATE INDEX IF NOT EXISTS idx_field_values_contact ON contact_field_values(contact_id);

-- RLS
ALTER TABLE email_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_field_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sequences_all" ON email_sequences FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "seq_steps_all" ON sequence_steps FOR ALL USING (EXISTS (SELECT 1 FROM email_sequences WHERE id = sequence_steps.sequence_id AND user_id = auth.uid()));
CREATE POLICY "contact_seqs_all" ON contact_sequences FOR ALL USING (EXISTS (SELECT 1 FROM contacts WHERE id = contact_sequences.contact_id AND user_id = auth.uid()));
CREATE POLICY "automations_all" ON automation_rules FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "field_defs_all" ON contact_field_definitions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "field_values_all" ON contact_field_values FOR ALL USING (EXISTS (SELECT 1 FROM contacts WHERE id = contact_field_values.contact_id AND user_id = auth.uid()));

-- Client portal: shareable report tokens
ALTER TABLE generated_reports ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;
ALTER TABLE generated_reports ADD COLUMN IF NOT EXISTS share_expires_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_reports_share_token ON generated_reports(share_token);


-- ============================================================
-- Personal Opportunity Flagging
-- ============================================================
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS flagged_own_pipeline BOOLEAN DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS own_pipeline_notes TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS own_pipeline_product TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS own_pipeline_flagged_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_contacts_own_pipeline ON contacts(flagged_own_pipeline) WHERE flagged_own_pipeline = true;

-- ============================================================
-- CRM Features (Win/Loss, Quotas, Snippets, Docs, Webhooks)
-- FROM: supabase-migration-crm-features.sql
-- ============================================================
-- ============================================================
-- LeadOS — CRM Features Migration
-- Win/Loss, Quotas, Snippets, Documents, Outbound Webhooks
-- ============================================================

-- Quotas (revenue or calls target per user per period)
CREATE TABLE IF NOT EXISTS quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  quota_type TEXT NOT NULL DEFAULT 'calls', -- calls | revenue
  target_value DECIMAL(12,2) NOT NULL,
  period TEXT NOT NULL DEFAULT 'monthly',   -- daily | weekly | monthly | quarterly
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, quota_type, period_start)
);

-- Snippets / text shortcuts
CREATE TABLE IF NOT EXISTS snippets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  trigger TEXT NOT NULL,    -- e.g. "/intro"
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, trigger)
);

-- Contact/deal documents
CREATE TABLE IF NOT EXISTS contact_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Outbound webhooks
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_quotas_user ON quotas(user_id);
CREATE INDEX IF NOT EXISTS idx_snippets_user ON snippets(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_docs_contact ON contact_documents(contact_id);
CREATE INDEX IF NOT EXISTS idx_outbound_webhooks_user ON outbound_webhooks(user_id);

-- RLS
ALTER TABLE quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE snippets ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbound_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotas_all" ON quotas FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "snippets_all" ON snippets FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "docs_all" ON contact_documents FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "webhooks_all" ON outbound_webhooks FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- Email + SMS Templates
-- ============================================================
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'email',      -- email | sms
  category TEXT DEFAULT 'general',         -- follow_up | thank_you | intro | proposal | breakup | general | custom
  subject TEXT,                            -- email only
  body TEXT NOT NULL,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_templates_user ON templates(user_id);
CREATE INDEX IF NOT EXISTS idx_templates_type ON templates(type);
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates_all" ON templates FOR ALL USING (auth.uid() = user_id);

-- Personal opportunity pipeline flags
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS flagged_own_pipeline BOOLEAN DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS own_pipeline_notes TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS own_pipeline_product TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS own_pipeline_flagged_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_contacts_own_pipeline ON contacts(flagged_own_pipeline) WHERE flagged_own_pipeline = true;

-- ============================================================
-- Docs Database enhancements
-- ============================================================
ALTER TABLE contact_documents ADD COLUMN IF NOT EXISTS document_category TEXT DEFAULT 'general';
ALTER TABLE contact_documents ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE contact_documents ADD COLUMN IF NOT EXISTS tags TEXT[];
CREATE INDEX IF NOT EXISTS idx_docs_category ON contact_documents(document_category);

-- ============================================================
-- Import System: batch tracking, sync, undo
-- ============================================================
CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  filename TEXT,
  source TEXT DEFAULT 'csv',  -- csv | hubspot | salesforce | pipedrive | google | zoho | sync
  mode TEXT DEFAULT 'create', -- create | sync | reverse_lookup
  total_created INTEGER DEFAULT 0,
  total_updated INTEGER DEFAULT 0,
  total_skipped INTEGER DEFAULT 0,
  can_undo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES import_batches(id);
CREATE INDEX IF NOT EXISTS idx_contacts_batch ON contacts(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_user ON import_batches(user_id);

ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "batches_all" ON import_batches FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- Performance Indexes (additional)
-- ============================================================
-- Contacts: frequently filtered columns
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company) WHERE company IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_email_norm ON contacts(email_normalized) WHERE email_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_last_called ON contacts(last_called_at) WHERE last_called_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_created ON contacts(created_at);

-- Calls: frequently joined + filtered
CREATE INDEX IF NOT EXISTS idx_calls_contact_id ON calls(contact_id);
CREATE INDEX IF NOT EXISTS idx_calls_created ON calls(created_at);
CREATE INDEX IF NOT EXISTS idx_calls_outcome ON calls(outcome);

-- Deals
CREATE INDEX IF NOT EXISTS idx_deals_created ON deals(created_at);
CREATE INDEX IF NOT EXISTS idx_deals_contact ON deals(contact_id);
CREATE INDEX IF NOT EXISTS idx_deals_won_at ON deals(won_at) WHERE won_at IS NOT NULL;

-- Tasks: due date + status combo (common query)
CREATE INDEX IF NOT EXISTS idx_tasks_due_status ON tasks(due_date, status) WHERE status = 'pending';

-- SMS + email logs
CREATE INDEX IF NOT EXISTS idx_sms_sent_at ON sms_logs(sent_at);
CREATE INDEX IF NOT EXISTS idx_email_logs_created ON email_logs(created_at);

-- Notifications query (hits voicemails + missed_calls + tasks)
CREATE INDEX IF NOT EXISTS idx_voicemails_status ON voicemails(status) WHERE status = 'unread';
CREATE INDEX IF NOT EXISTS idx_missed_calls_returned ON missed_calls(returned) WHERE returned = false;

-- ============================================================
-- Expanded Settings: Password Vault, API Key Vault, Preferences
-- ============================================================

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

CREATE INDEX IF NOT EXISTS idx_password_vault_user ON password_vault(user_id);
CREATE INDEX IF NOT EXISTS idx_api_key_vault_user ON api_key_vault(user_id);

ALTER TABLE password_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_key_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pwd_vault_all" ON password_vault FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "api_vault_all" ON api_key_vault FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "prefs_all" ON user_preferences FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- Extended Settings Fields
-- ============================================================
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS working_hours_start TEXT DEFAULT '08:00';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS working_hours_end TEXT DEFAULT '21:00';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS working_days TEXT[] DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri'];
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS call_retry_limit INTEGER DEFAULT 3;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS call_retry_interval_hours INTEGER DEFAULT 24;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS notify_new_leads BOOLEAN DEFAULT true;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS notify_overdue_tasks BOOLEAN DEFAULT true;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS notify_missed_calls BOOLEAN DEFAULT true;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS notify_voicemails BOOLEAN DEFAULT true;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS notify_new_deals BOOLEAN DEFAULT true;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS daily_digest_email BOOLEAN DEFAULT false;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS smtp_host TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS smtp_port INTEGER DEFAULT 587;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS smtp_user TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS smtp_pass_encrypted TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS sms_auto_reply TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS default_from_number TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS invoice_header TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS invoice_footer TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS invoice_logo_url TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS email_signature TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS default_call_type TEXT DEFAULT 'cold_call';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS auto_score_on_import BOOLEAN DEFAULT true;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS data_retention_months INTEGER DEFAULT 0;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS agency_name TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS agency_logo_url TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS agency_website TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS agency_phone TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS agency_address TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS sidebar_hidden_items TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS sidebar_item_order JSONB;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS default_task_priority TEXT DEFAULT 'medium';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS recording_compliance_message TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS recording_compliance_enabled BOOLEAN DEFAULT false;

-- ============================================================
-- FROM: supabase-migration-settings.sql (base tables)
-- Settings & Security — user_settings, api_tokens, login_activity
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

CREATE INDEX IF NOT EXISTS idx_user_settings_user ON user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_login_activity_user ON login_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_login_activity_login_at ON login_activity(login_at);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_settings_all" ON user_settings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "api_tokens_all" ON api_tokens FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "login_activity_all" ON login_activity FOR ALL USING (auth.uid() = user_id);


-- ============================================================
-- NEW: supabase-migration-financials.sql
-- Financials Panel — Balance Tracker, Tech Stack, Budget
-- ============================================================

-- Weekly manual income/expense log
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

-- SaaS/tool/subscription tracker
CREATE TABLE IF NOT EXISTS tech_stack_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  category TEXT DEFAULT 'other',        -- calling | ai | hosting | crm | marketing | productivity | other
  monthly_cost DECIMAL(10,2) DEFAULT 0,
  billing_cycle TEXT DEFAULT 'monthly', -- monthly | annual | one_time
  url TEXT,
  notes TEXT,
  project_ids UUID[] DEFAULT '{}',
  campaign_ids UUID[] DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Personal/business budget line items
CREATE TABLE IF NOT EXISTS budget_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  entry_type TEXT NOT NULL,       -- income | expense
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  frequency TEXT DEFAULT 'monthly', -- one_time | weekly | monthly | annual
  entry_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_balance_entries_user ON balance_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_balance_entries_date ON balance_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_tech_stack_user ON tech_stack_items(user_id);
CREATE INDEX IF NOT EXISTS idx_tech_stack_active ON tech_stack_items(user_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_budget_entries_user ON budget_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_entries_type ON budget_entries(entry_type);

-- RLS
ALTER TABLE balance_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tech_stack_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "balance_entries_all" ON balance_entries FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "tech_stack_all" ON tech_stack_items FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "budget_entries_all" ON budget_entries FOR ALL USING (auth.uid() = user_id);

-- Add paid_at timestamp to invoices for payment tracking
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_method TEXT; -- ach | check | cash | stripe | other
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_notes TEXT;


-- ============================================================
-- NEW: supabase-migration-stack-manager.sql
-- Stack Manager — service accounts, credentials, billing, trials
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

-- Twilio Usage API note: no schema changes needed — data is pulled live from Twilio REST API
-- Endpoint: GET /api/financials/twilio-usage?range=ThisMonth|LastMonth|Today


-- ============================================================
-- NEW: supabase-migration-marketing.sql
-- Marketing assets, social platforms, posts, ad campaigns
-- ============================================================

CREATE TABLE IF NOT EXISTS marketing_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  asset_type TEXT DEFAULT 'image',
  source TEXT DEFAULT 'upload',
  file_url TEXT, thumbnail_url TEXT, canva_design_id TEXT, canva_edit_url TEXT,
  prompt TEXT, width INTEGER, height INTEGER, format TEXT,
  platform TEXT, status TEXT DEFAULT 'draft', tags TEXT[] DEFAULT '{}', notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_platform_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  account_name TEXT, account_handle TEXT, account_url TEXT,
  followers INTEGER DEFAULT 0, following INTEGER DEFAULT 0,
  access_token_vault_id UUID REFERENCES api_key_vault(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'connected', last_synced_at TIMESTAMP, notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, client_id, platform)
);

CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  platform_account_id UUID REFERENCES social_platform_accounts(id) ON DELETE SET NULL,
  asset_id UUID REFERENCES marketing_assets(id) ON DELETE SET NULL,
  caption TEXT, hashtags TEXT, platforms TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'draft', scheduled_at TIMESTAMP, published_at TIMESTAMP,
  post_url TEXT, external_post_id TEXT,
  engagement_likes INTEGER DEFAULT 0, engagement_comments INTEGER DEFAULT 0,
  engagement_shares INTEGER DEFAULT 0, engagement_reach INTEGER DEFAULT 0,
  notes TEXT, ai_generated BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ad_campaigns_ext (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  lead_campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  name TEXT NOT NULL, platform TEXT NOT NULL,
  campaign_type TEXT DEFAULT 'awareness', status TEXT DEFAULT 'active',
  budget DECIMAL(10,2), budget_period TEXT DEFAULT 'monthly',
  spent DECIMAL(10,2) DEFAULT 0, impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0, leads INTEGER DEFAULT 0, conversions INTEGER DEFAULT 0,
  ctr DECIMAL(6,4), cpc DECIMAL(10,4), cpl DECIMAL(10,2), roas DECIMAL(10,2),
  start_date DATE, end_date DATE, ad_account_id TEXT, external_campaign_id TEXT,
  notes TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
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
-- NEW: supabase-migration-hr-payroll.sql
-- HR fields, payroll, Slack/Teams integration config
-- ============================================================

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS hire_date DATE;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS contract_type TEXT DEFAULT 'full_time';
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS pay_rate DECIMAL(10,2);
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS pay_type TEXT DEFAULT 'salary';
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS pay_frequency TEXT DEFAULT 'bi_weekly';
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS quota_monthly DECIMAL(12,2);
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5,2);
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS avatar_url TEXT;

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
  paid_at TIMESTAMP, payment_method TEXT DEFAULT 'ach',
  reference TEXT, notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS slack_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
  workspace_name TEXT, bot_token_vault_id UUID REFERENCES api_key_vault(id),
  default_channel TEXT DEFAULT '#general', webhook_url TEXT,
  notify_new_leads BOOLEAN DEFAULT true, notify_calls BOOLEAN DEFAULT false,
  notify_deals BOOLEAN DEFAULT false, notify_tasks BOOLEAN DEFAULT false,
  connected_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teams_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
  webhook_url TEXT NOT NULL, channel_name TEXT,
  notify_new_leads BOOLEAN DEFAULT true, notify_calls BOOLEAN DEFAULT false,
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
-- NEW: supabase-migration-contact-associations.sql
-- Many-to-many contact associations: clients, campaigns, projects
-- ============================================================

CREATE TABLE IF NOT EXISTS contact_client_assoc (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(contact_id, client_id)
);

CREATE TABLE IF NOT EXISTS contact_campaign_assoc (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(contact_id, campaign_id)
);

CREATE TABLE IF NOT EXISTS contact_project_assoc (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(contact_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_cca_contact ON contact_client_assoc(contact_id);
CREATE INDEX IF NOT EXISTS idx_cca_client ON contact_client_assoc(client_id);
CREATE INDEX IF NOT EXISTS idx_ccampa_contact ON contact_campaign_assoc(contact_id);
CREATE INDEX IF NOT EXISTS idx_ccampa_campaign ON contact_campaign_assoc(campaign_id);
CREATE INDEX IF NOT EXISTS idx_cpa_contact ON contact_project_assoc(contact_id);
CREATE INDEX IF NOT EXISTS idx_cpa_project ON contact_project_assoc(project_id);

ALTER TABLE contact_client_assoc ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_campaign_assoc ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_project_assoc ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cca_all" ON contact_client_assoc FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "ccampa_all" ON contact_campaign_assoc FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "cpa_all" ON contact_project_assoc FOR ALL USING (auth.uid() = user_id);


-- ============================================================
-- NEW: Dashboard layout persistence + contact associations
-- Run after contact-associations migration
-- ============================================================

-- Add dashboard_layout column to user_preferences
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS dashboard_layout JSONB;

-- Contact association tables (if not already run from separate migration)
CREATE TABLE IF NOT EXISTS contact_client_assoc (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(contact_id, client_id)
);

CREATE TABLE IF NOT EXISTS contact_campaign_assoc (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(contact_id, campaign_id)
);

CREATE TABLE IF NOT EXISTS contact_project_assoc (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(contact_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_cca_contact ON contact_client_assoc(contact_id);
CREATE INDEX IF NOT EXISTS idx_cca_client ON contact_client_assoc(client_id);
CREATE INDEX IF NOT EXISTS idx_ccampa_contact ON contact_campaign_assoc(contact_id);
CREATE INDEX IF NOT EXISTS idx_cpa_contact ON contact_project_assoc(contact_id);

ALTER TABLE contact_client_assoc ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_campaign_assoc ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_project_assoc ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cca_all" ON contact_client_assoc FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "ccampa_all" ON contact_campaign_assoc FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "cpa_all" ON contact_project_assoc FOR ALL USING (auth.uid() = user_id);
