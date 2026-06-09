-- ============================================================
-- LeadOS — PENDING MIGRATIONS
-- Run this ENTIRE file in Supabase SQL Editor
-- Starts where campaigns/analytics/phone/scraper/time left off
-- Everything uses IF NOT EXISTS — safe to run multiple times
-- Last updated: 2026-05-30
-- ============================================================


-- ============================================================
-- 1. SCRIPTS, TEAM & CAMPAIGN GOALS
-- scripts, script_objections, campaign_goals,
-- client_knowledge, team_members
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
  UNIQUE(owner_user_id, member_email)
);

CREATE INDEX IF NOT EXISTS idx_scripts_user ON scripts(user_id);
CREATE INDEX IF NOT EXISTS idx_scripts_client ON scripts(client_id);
CREATE INDEX IF NOT EXISTS idx_script_objections_script ON script_objections(script_id);
CREATE INDEX IF NOT EXISTS idx_campaign_goals_campaign ON campaign_goals(campaign_id);
CREATE INDEX IF NOT EXISTS idx_client_knowledge_client ON client_knowledge(client_id);
CREATE INDEX IF NOT EXISTS idx_team_members_owner ON team_members(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_member ON team_members(member_user_id);

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
-- 2. EXTENDED CONTACT FIELDS
-- Adds type, source, scoring, pipeline flagging columns
-- ============================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS contact_type TEXT DEFAULT 'lead';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_source TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_business BOOLEAN DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS customer_since DATE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS do_not_email BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts(contact_type);
CREATE INDEX IF NOT EXISTS idx_contacts_source ON contacts(lead_source);


-- ============================================================
-- 3. LEAD SOURCES, TASKS & EMAIL LOGS
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
-- 4. SCRIPT TRACKING & CALL QUALITY
-- Extends calls table, adds objection logs
-- ============================================================

ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_type TEXT DEFAULT 'cold_call';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS script_id UUID REFERENCES scripts(id);
ALTER TABLE calls ADD COLUMN IF NOT EXISTS quality_score INTEGER;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS quality_breakdown TEXT;

CREATE TABLE IF NOT EXISTS script_objection_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  script_id UUID NOT NULL REFERENCES scripts(id),
  objection_id UUID NOT NULL REFERENCES script_objections(id),
  logged_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_objection_logs_call ON script_objection_logs(call_id);
CREATE INDEX IF NOT EXISTS idx_objection_logs_script ON script_objection_logs(script_id);
CREATE INDEX IF NOT EXISTS idx_calls_script ON calls(script_id);
CREATE INDEX IF NOT EXISTS idx_calls_type ON calls(call_type);
CREATE INDEX IF NOT EXISTS idx_calls_created ON calls(created_at);
CREATE INDEX IF NOT EXISTS idx_calls_outcome ON calls(outcome);

ALTER TABLE script_objection_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "obj_logs_all" ON script_objection_logs FOR ALL USING (
  EXISTS (SELECT 1 FROM calls WHERE calls.id = script_objection_logs.call_id AND calls.user_id = auth.uid())
);


-- ============================================================
-- 5. SALES FEATURES
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
-- 6. ADVANCED FEATURES
-- Contact scoring, email sequences, automation rules,
-- custom contact fields, report share tokens
-- ============================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS contact_score INTEGER DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS score_updated_at TIMESTAMP;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS flagged_own_pipeline BOOLEAN DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS own_pipeline_notes TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS own_pipeline_product TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS own_pipeline_flagged_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_contacts_score ON contacts(contact_score);
CREATE INDEX IF NOT EXISTS idx_contacts_own_pipeline ON contacts(flagged_own_pipeline) WHERE flagged_own_pipeline = true;

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

ALTER TABLE generated_reports ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;
ALTER TABLE generated_reports ADD COLUMN IF NOT EXISTS share_expires_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_reports_share_token ON generated_reports(share_token);

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
-- 7. CRM FEATURES
-- quotas, snippets, templates, contact_documents,
-- outbound_webhooks
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
-- 8. IMPORT SYSTEM
-- import_batches, extend contacts with batch tracking
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

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES import_batches(id);

CREATE INDEX IF NOT EXISTS idx_contacts_batch ON contacts(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_user ON import_batches(user_id);

ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "batches_all" ON import_batches FOR ALL USING (auth.uid() = user_id);


-- ============================================================
-- 9. PERFORMANCE INDEXES
-- Additional indexes on high-traffic columns
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company) WHERE company IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_email_norm ON contacts(email_normalized) WHERE email_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_last_called ON contacts(last_called_at) WHERE last_called_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_created ON contacts(created_at);
CREATE INDEX IF NOT EXISTS idx_deals_contact ON deals(contact_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_status ON tasks(due_date, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_voicemails_status ON voicemails(status) WHERE status = 'unread';
CREATE INDEX IF NOT EXISTS idx_missed_calls_returned ON missed_calls(returned) WHERE returned = false;


-- ============================================================
-- 10. SETTINGS & SECURITY
-- user_settings, api_tokens, login_activity,
-- password_vault, api_key_vault, user_preferences
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
  -- Working hours & calling rules
  working_hours_start TEXT DEFAULT '08:00',
  working_hours_end TEXT DEFAULT '21:00',
  working_days TEXT[] DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri'],
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
  -- Agency / Invoice branding
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
-- 11. FINANCIALS
-- balance_entries, tech_stack_items, budget_entries
-- invoice payment fields
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

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_notes TEXT;

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
-- 12. STACK MANAGER
-- Full service account tracking with credential linking
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
-- 13. MARKETING
-- marketing_assets, social_platform_accounts,
-- social_posts, ad_campaigns_ext
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
-- 14. HR, PAYROLL & TEAM EXTENSIONS
-- Extend team_members with HR fields,
-- payroll_entries, slack_integrations, teams_integrations
-- ============================================================

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS hire_date DATE;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS contract_type TEXT DEFAULT 'full_time';
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS pay_rate DECIMAL(10,2);
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS pay_type TEXT DEFAULT 'salary';
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS pay_frequency TEXT DEFAULT 'bi_weekly';
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;
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
-- END — 14 sections, 33 new/modified tables
-- Run entire file as one paste in Supabase SQL Editor
-- ============================================================
