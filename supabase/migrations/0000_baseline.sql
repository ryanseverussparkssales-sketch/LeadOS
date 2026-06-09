-- ============================================================================
-- 0000_baseline.sql - LeadOS production schema baseline
-- Generated 2026-06-09 from the live Supabase schema (project legzdsbemjowgddwavbi)
-- via catalog -> DDL dump (see supabase/migrations/README.md).
--
-- This is the rebuildable source of truth: tables, columns, defaults, PK/FK/unique/
-- check constraints, indexes, RLS enablement, policies, and functions.
-- Production already matches this; do not re-run against prod. Apply only to a
-- fresh/shadow DB for disaster recovery, then apply 0001+ in order.
-- NOT included: triggers and explicit role GRANTs (schema uses neither at dump time).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ad_campaigns_ext (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid,
  lead_campaign_id uuid,
  name text NOT NULL,
  platform text NOT NULL,
  campaign_type text DEFAULT 'awareness'::text,
  status text DEFAULT 'active'::text,
  budget numeric(10,2),
  budget_period text DEFAULT 'monthly'::text,
  spent numeric(10,2) DEFAULT 0,
  impressions integer DEFAULT 0,
  clicks integer DEFAULT 0,
  leads integer DEFAULT 0,
  conversions integer DEFAULT 0,
  ctr numeric(6,4),
  cpc numeric(10,4),
  cpl numeric(10,2),
  roas numeric(10,2),
  start_date date,
  end_date date,
  ad_account_id text,
  external_campaign_id text,
  notes text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.api_key_vault (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  service text,
  key_value text NOT NULL,
  environment text DEFAULT 'production'::text,
  notes text,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.api_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  token_hash text NOT NULL,
  scopes text[] DEFAULT ARRAY['read'::text],
  last_used_at timestamp without time zone,
  expires_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.api_usage_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  call_id uuid NOT NULL,
  twilio_duration_minutes integer DEFAULT 0,
  twilio_cost numeric(10,4) DEFAULT 0,
  groq_cost numeric(10,6) DEFAULT 0,
  claude_input_tokens integer DEFAULT 0,
  claude_output_tokens integer DEFAULT 0,
  claude_cost numeric(10,4) DEFAULT 0,
  total_cost numeric(10,4) DEFAULT 0,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.appointment_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  campaign_id uuid,
  name text NOT NULL DEFAULT 'Appointment'::text,
  duration_minutes integer DEFAULT 30,
  default_format text DEFAULT 'phone'::text,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  call_id uuid,
  contact_id uuid NOT NULL,
  campaign_id uuid,
  scheduled_at timestamp with time zone,
  duration_minutes integer DEFAULT 30,
  format text DEFAULT 'phone'::text,
  location text,
  meeting_link text,
  notes text,
  qualifying_answers jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'scheduled'::text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.asset_shares (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL,
  shared_by uuid NOT NULL,
  share_token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'base64url'::text),
  recipient_email text,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + '7 days'::interval),
  accessed_at timestamp with time zone,
  access_count integer DEFAULT 0,
  is_revoked boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.asset_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL,
  version integer NOT NULL,
  storage_path text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'assets'::text,
  file_size bigint,
  mime_type text,
  uploaded_by uuid,
  upload_note text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.automation_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  trigger_type text NOT NULL,
  conditions jsonb DEFAULT '[]'::jsonb,
  actions jsonb DEFAULT '[]'::jsonb,
  enabled boolean DEFAULT true,
  run_count integer DEFAULT 0,
  last_run_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.balance_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entry_date date NOT NULL,
  income numeric(12,2) DEFAULT 0,
  expenses numeric(12,2) DEFAULT 0,
  notes text,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.budget_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entry_type text NOT NULL,
  category text NOT NULL,
  label text NOT NULL,
  amount numeric(12,2) NOT NULL,
  frequency text DEFAULT 'monthly'::text,
  entry_date date,
  notes text,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.call_feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL,
  reviewer_user_id uuid NOT NULL,
  content text NOT NULL,
  timestamp_seconds integer,
  rating integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.call_list_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  call_list_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  status text DEFAULT 'pending'::text,
  skip_count integer DEFAULT 0,
  skip_limit integer DEFAULT 3,
  queue_position integer,
  added_at timestamp without time zone DEFAULT now(),
  attempt_count integer DEFAULT 0,
  last_called_at timestamp with time zone,
  next_follow_up_at timestamp with time zone,
  cadence_complete boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.call_lists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  name text NOT NULL,
  status text DEFAULT 'active'::text,
  created_at timestamp without time zone DEFAULT now(),
  campaign_id uuid,
  deleted_at timestamp with time zone,
  user_id uuid
);

CREATE TABLE IF NOT EXISTS public.calls (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_id uuid,
  call_list_id uuid,
  phone_number text,
  call_duration_seconds integer,
  started_at timestamp without time zone,
  ended_at timestamp without time zone,
  recording_url text,
  raw_transcript text,
  summary text,
  outcome text,
  notes text,
  created_at timestamp without time zone DEFAULT now(),
  twilio_call_sid text,
  call_type text DEFAULT 'cold_call'::text,
  script_id uuid,
  quality_score integer,
  quality_breakdown text,
  direction text DEFAULT 'outbound'::text,
  from_number text,
  to_number text,
  status text,
  phone_number_id uuid,
  campaign_id uuid,
  deleted_at timestamp with time zone,
  processed_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.campaign_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  last_called_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.campaign_goals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  goal_type text NOT NULL,
  target_value numeric(10,2) NOT NULL,
  period text DEFAULT 'daily'::text,
  current_value numeric(10,2) DEFAULT 0,
  last_reset date
);

CREATE TABLE IF NOT EXISTS public.campaign_sdrs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  sdr_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campaign_wins (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  user_id uuid NOT NULL,
  outcome text NOT NULL,
  weight integer NOT NULL DEFAULT 1,
  call_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  name text NOT NULL,
  status text DEFAULT 'active'::text,
  created_at timestamp without time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  campaign_type text DEFAULT 'call'::text,
  email_sequence_id uuid,
  description text,
  goal text,
  target_contacts integer,
  from_email_account_id uuid,
  from_phone_number_id uuid,
  win_outcome text,
  win_label text,
  win_count integer DEFAULT 0,
  target_wins integer,
  custom_outcomes jsonb,
  daily_call_goal integer,
  calls_per_lead integer DEFAULT 1,
  calls_today integer DEFAULT 0,
  total_calls integer DEFAULT 0,
  last_reset_date date,
  followup_count integer DEFAULT 0,
  cadence_days integer DEFAULT 14,
  win_conditions jsonb DEFAULT '[]'::jsonb,
  is_test boolean DEFAULT false,
  user_id uuid
);

CREATE TABLE IF NOT EXISTS public.channel_participants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL,
  user_id uuid NOT NULL,
  participant_role text NOT NULL,
  last_read_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.client_docs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  client_id uuid NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  doc_type text DEFAULT 'file'::text,
  description text,
  file_size integer,
  is_visible_to_client boolean DEFAULT true,
  from_client boolean DEFAULT false,
  submitted_by_name text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_knowledge (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  knowledge_type text DEFAULT 'general'::text,
  sort_order integer DEFAULT 0,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  description text,
  industry text,
  website text,
  linkedin_url text,
  logo_url text,
  notes text,
  tags text[],
  timezone text,
  contract_status text,
  contract_value numeric,
  primary_contact_name text,
  primary_contact_email text,
  primary_contact_phone text,
  is_test boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.companies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  phone text,
  phone_normalized text,
  email text,
  website text,
  industry text,
  address text,
  city text,
  state text,
  description text,
  company_type text DEFAULT 'prospect'::text,
  size text,
  linkedin_url text,
  notes text,
  tags text[],
  client_id uuid,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contact_activities (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  activity_type text NOT NULL DEFAULT 'note'::text,
  title text,
  description text,
  outcome text,
  scheduled_at timestamp with time zone,
  duration_minutes integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contact_campaign_assoc (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contact_client_assoc (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  client_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contact_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_id uuid,
  deal_id uuid,
  name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size integer,
  document_category text DEFAULT 'general'::text,
  storage_path text,
  tags text[],
  created_at timestamp without time zone DEFAULT now(),
  client_id uuid,
  project_id uuid,
  bucket_name text DEFAULT 'documents'::text,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.contact_enrichments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  company_summary text,
  outreach_angle text,
  personalized_message text,
  talking_points text,
  enriched_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contact_field_definitions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  field_key text NOT NULL,
  field_type text DEFAULT 'text'::text,
  options jsonb,
  sort_order integer DEFAULT 0,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contact_field_values (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  field_definition_id uuid NOT NULL,
  value text,
  updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contact_filters (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  filter_config jsonb DEFAULT '{}'::jsonb,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contact_inquiries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  company text,
  vertical text,
  budget text,
  message text,
  source text DEFAULT 'contact_page'::text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contact_project_assoc (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contact_sequences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  sequence_id uuid NOT NULL,
  current_step integer DEFAULT 0,
  status text DEFAULT 'active'::text,
  started_at timestamp without time zone DEFAULT now(),
  next_step_at timestamp without time zone,
  campaign_id uuid,
  user_id uuid
);

CREATE TABLE IF NOT EXISTS public.contact_tag_mappings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  added_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contact_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#888888'::text,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  company text,
  title text,
  phone_normalized text,
  email_normalized text,
  status text DEFAULT 'active'::text,
  call_count integer DEFAULT 0,
  last_called_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  contact_type text DEFAULT 'lead'::text,
  lead_source text,
  is_business boolean DEFAULT false,
  notes text,
  customer_since date,
  linkedin_url text,
  website text,
  do_not_email boolean DEFAULT false,
  contact_score integer DEFAULT 0,
  score_updated_at timestamp without time zone,
  flagged_own_pipeline boolean DEFAULT false,
  own_pipeline_notes text,
  own_pipeline_product text,
  own_pipeline_flagged_at timestamp without time zone,
  import_batch_id uuid,
  deleted_at timestamp with time zone,
  company_id uuid,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  lead_metadata jsonb DEFAULT '{}'::jsonb,
  lead_source_id uuid,
  is_test boolean DEFAULT false,
  lead_score integer,
  tags text[]
);

CREATE TABLE IF NOT EXISTS public.cron_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  last_run timestamp with time zone,
  last_result text,
  details jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.deals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_id uuid,
  client_id uuid,
  campaign_id uuid,
  title text NOT NULL,
  value numeric(12,2) DEFAULT 0,
  stage text NOT NULL DEFAULT 'prospect'::text,
  probability integer DEFAULT 20,
  expected_close date,
  notes text,
  lost_reason text,
  won_at timestamp without time zone,
  lost_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.dialer_activity (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid,
  project_id uuid,
  campaign_id uuid,
  activity_type text,
  activity_start timestamp without time zone DEFAULT now(),
  activity_end timestamp without time zone,
  duration_seconds integer,
  call_id uuid,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text NOT NULL,
  email_address text NOT NULL,
  smtp_host text DEFAULT 'smtp.gmail.com'::text,
  smtp_port integer DEFAULT 587,
  smtp_user text,
  smtp_password_encrypted text,
  is_default boolean DEFAULT false,
  client_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  inbound_address text,
  provider text DEFAULT 'smtp'::text,
  oauth_access_token text,
  oauth_refresh_token text,
  oauth_token_expires_at timestamp with time zone,
  oauth_scopes text[],
  gmail_history_id text,
  last_synced_at timestamp with time zone,
  sync_enabled boolean DEFAULT true,
  google_account_id text,
  email text DEFAULT email_address,
  is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.email_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_id uuid,
  call_id uuid,
  task_id uuid,
  subject text,
  body text NOT NULL,
  email_type text DEFAULT 'follow_up'::text,
  status text DEFAULT 'draft'::text,
  generated_by text DEFAULT 'manual'::text,
  sent_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT now(),
  campaign_id uuid,
  project_id uuid,
  client_id uuid,
  reply_tag text,
  direction text DEFAULT 'outbound'::text,
  read_at timestamp with time zone,
  from_address text,
  to_address text,
  reply_to text,
  in_reply_to text,
  message_id text,
  thread_id text,
  html_body text,
  attachments jsonb DEFAULT '[]'::jsonb,
  intent_label text,
  intent_score numeric(3,2),
  spam_score numeric(4,2),
  resend_email_id text,
  email_thread_id uuid
);

CREATE TABLE IF NOT EXISTS public.email_sequences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  trigger_type text DEFAULT 'manual'::text,
  status text DEFAULT 'active'::text,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_threads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_id uuid,
  subject text NOT NULL,
  thread_key text NOT NULL,
  last_message_at timestamp with time zone,
  last_message_body text,
  last_message_direction text,
  unread_count integer DEFAULT 0,
  message_count integer DEFAULT 0,
  participants text[],
  created_at timestamp with time zone DEFAULT now(),
  campaign_id uuid
);

CREATE TABLE IF NOT EXISTS public.engagements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  client_id uuid NOT NULL,
  sdr_user_id uuid,
  base_fee integer NOT NULL DEFAULT 0,
  bonus_rate integer NOT NULL DEFAULT 50,
  billing_day integer DEFAULT 1,
  notes text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.generated_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid,
  project_id uuid,
  campaign_id uuid,
  report_type text NOT NULL,
  report_title text NOT NULL,
  date_from date,
  date_to date,
  content text,
  html_content text,
  status text DEFAULT 'draft'::text,
  created_at timestamp without time zone DEFAULT now(),
  share_token text,
  share_expires_at timestamp without time zone
);

CREATE TABLE IF NOT EXISTS public.import_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  filename text,
  source text DEFAULT 'csv'::text,
  mode text DEFAULT 'create'::text,
  total_created integer DEFAULT 0,
  total_updated integer DEFAULT 0,
  total_skipped integer DEFAULT 0,
  can_undo boolean DEFAULT true,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid,
  report_id uuid,
  invoice_number text,
  invoice_date date,
  due_date date,
  hours_worked numeric(10,2),
  hourly_rate numeric(10,2),
  subtotal numeric(12,2),
  tax_percent numeric(5,2) DEFAULT 0,
  tax_amount numeric(12,2),
  total numeric(12,2),
  status text DEFAULT 'draft'::text,
  created_at timestamp without time zone DEFAULT now(),
  bank_name text,
  routing_number text,
  account_number text,
  account_type text DEFAULT 'checking'::text,
  payment_memo text,
  paid_at timestamp without time zone,
  payment_method text,
  payment_notes text,
  contract_type text DEFAULT 'invoice'::text,
  contract_start date,
  contract_end date,
  scope_of_work text,
  expected_hours_weekly numeric(6,2),
  expected_hours_monthly numeric(6,2),
  project_ids uuid[]
);

CREATE TABLE IF NOT EXISTS public.lead_routing_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_source_id uuid,
  rule_order integer NOT NULL DEFAULT 0,
  name text,
  condition_field text NOT NULL,
  condition_operator text NOT NULL DEFAULT 'contains'::text,
  condition_value text,
  action_type text NOT NULL,
  action_value text,
  stop_on_match boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lead_sources (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  source_type text DEFAULT 'webhook'::text,
  client_id uuid,
  project_id uuid,
  campaign_id uuid,
  auto_call_list_id uuid,
  webhook_token text NOT NULL DEFAULT (gen_random_uuid())::text,
  default_contact_type text DEFAULT 'lead'::text,
  lead_count integer DEFAULT 0,
  status text DEFAULT 'active'::text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  description text,
  metadata_schema jsonb DEFAULT '[]'::jsonb,
  leads_today integer DEFAULT 0,
  leads_this_week integer DEFAULT 0,
  last_lead_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.login_activity (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ip_address text,
  user_agent text,
  device_name text,
  login_at timestamp without time zone DEFAULT now(),
  status text DEFAULT 'active'::text
);

CREATE TABLE IF NOT EXISTS public.marketing_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid,
  campaign_id uuid,
  name text NOT NULL,
  asset_type text DEFAULT 'image'::text,
  source text DEFAULT 'upload'::text,
  file_url text,
  thumbnail_url text,
  canva_design_id text,
  canva_edit_url text,
  prompt text,
  width integer,
  height integer,
  format text,
  platform text,
  status text DEFAULT 'draft'::text,
  tags text[] DEFAULT '{}'::text[],
  notes text,
  created_at timestamp without time zone DEFAULT now(),
  storage_path text,
  storage_bucket text DEFAULT 'assets'::text,
  file_size bigint,
  mime_type text,
  original_filename text,
  uploaded_by uuid,
  version integer DEFAULT 1,
  parent_asset_id uuid,
  is_latest_version boolean DEFAULT true,
  approved_by uuid,
  approved_at timestamp with time zone,
  expires_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.message_channels (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  name text NOT NULL,
  channel_type text NOT NULL DEFAULT 'campaign'::text,
  campaign_id uuid,
  client_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  sender_role text NOT NULL,
  sender_name text,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.missed_calls (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  phone_number_id uuid,
  caller_id text NOT NULL,
  caller_name text,
  call_duration_seconds integer DEFAULT 0,
  returned boolean DEFAULT false,
  returned_at timestamp without time zone,
  notes text,
  received_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.outbound_webhooks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  url text NOT NULL,
  events text[] DEFAULT ARRAY['lead_arrived'::text],
  secret text,
  enabled boolean DEFAULT true,
  delivery_count integer DEFAULT 0,
  last_delivered_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.password_vault (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  site_name text NOT NULL,
  site_url text,
  username text,
  password_encrypted text NOT NULL,
  notes text,
  category text DEFAULT 'general'::text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payouts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  team_member_id uuid,
  call_id uuid,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd'::text,
  stripe_transfer_id text,
  status text NOT NULL DEFAULT 'pending'::text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  paid_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.payroll_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  team_member_id uuid,
  member_email text,
  pay_period_start date NOT NULL,
  pay_period_end date NOT NULL,
  base_pay numeric(10,2) DEFAULT 0,
  commission numeric(10,2) DEFAULT 0,
  bonuses numeric(10,2) DEFAULT 0,
  deductions numeric(10,2) DEFAULT 0,
  net_pay numeric(10,2) DEFAULT (((base_pay + commission) + bonuses) - deductions),
  status text DEFAULT 'pending'::text,
  paid_at timestamp without time zone,
  payment_method text DEFAULT 'ach'::text,
  reference text,
  notes text,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.phone_numbers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  phone_number text NOT NULL,
  twilio_phone_sid text,
  friendly_name text,
  client_id uuid,
  campaign_id uuid,
  status text DEFAULT 'active'::text,
  is_primary boolean DEFAULT false,
  voicemail_greeting text,
  record_incoming boolean DEFAULT true,
  created_at timestamp without time zone DEFAULT now(),
  assigned_user_id uuid,
  forwarding_number text,
  forwarding_enabled boolean DEFAULT false,
  voicemail_enabled boolean DEFAULT true,
  ring_timeout_seconds integer DEFAULT 25,
  calls_today integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL,
  email text,
  full_name text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  from_email_account_id uuid,
  from_phone_number_id uuid,
  user_id uuid,
  status text DEFAULT 'active'::text,
  calls_today integer DEFAULT 0,
  daily_call_goal integer,
  target_wins integer,
  win_count integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.quotas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quota_type text NOT NULL DEFAULT 'calls'::text,
  target_value numeric(12,2) NOT NULL,
  period text NOT NULL DEFAULT 'monthly'::text,
  period_start date NOT NULL,
  period_end date NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  current_value numeric DEFAULT 0,
  updated_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.rep_interview_answers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  question_index integer NOT NULL,
  question_text text NOT NULL,
  recording_url text,
  transcript text,
  score integer,
  feedback text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rep_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  username text,
  display_name text,
  bio text,
  location text,
  specialties text[] DEFAULT '{}'::text[],
  hourly_rate integer,
  availability text DEFAULT 'available'::text,
  interview_score integer,
  interview_completed_at timestamp with time zone,
  roleplay_unlocked boolean DEFAULT false,
  roleplay_score integer,
  is_public boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  years_experience integer,
  previous_roles text,
  top_achievement text,
  certifications text[] DEFAULT '{}'::text[]
);

CREATE TABLE IF NOT EXISTS public.rep_supercut_clips (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  call_id uuid,
  clip_type text NOT NULL,
  start_seconds integer,
  end_seconds integer,
  recording_url text,
  transcript_excerpt text,
  ai_reason text,
  created_at timestamp with time zone DEFAULT now(),
  is_featured boolean DEFAULT false,
  display_order integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.rep_testimonials (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_name text NOT NULL,
  client_company text,
  client_title text,
  content text NOT NULL,
  rating integer DEFAULT 5,
  approved boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.scraped_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source text,
  source_url text,
  raw_name text,
  raw_email text,
  raw_phone text,
  raw_title text,
  raw_company text,
  confidence numeric(3,2) DEFAULT 0.8,
  status text DEFAULT 'pending'::text,
  contact_id uuid,
  notes text,
  created_at timestamp without time zone DEFAULT now(),
  source_query text,
  campaign_id uuid,
  call_list_id uuid
);

CREATE TABLE IF NOT EXISTS public.script_objection_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL,
  script_id uuid NOT NULL,
  objection_id uuid NOT NULL,
  logged_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.script_objections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  script_id uuid NOT NULL,
  objection text NOT NULL,
  response text NOT NULL,
  follow_up text,
  sort_order integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.scripts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid,
  campaign_id uuid,
  title text NOT NULL,
  opener text,
  elevator_pitch text,
  discovery text,
  closing text,
  is_default boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sequence_steps (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL,
  step_number integer NOT NULL,
  delay_days integer DEFAULT 0,
  subject text NOT NULL,
  body text NOT NULL,
  email_type text DEFAULT 'follow_up'::text,
  delay_hours integer DEFAULT 0,
  step_order integer
);

CREATE TABLE IF NOT EXISTS public.slack_integrations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_name text,
  bot_token_vault_id uuid,
  default_channel text DEFAULT '#general'::text,
  webhook_url text,
  notify_new_leads boolean DEFAULT true,
  notify_calls boolean DEFAULT false,
  notify_deals boolean DEFAULT false,
  notify_tasks boolean DEFAULT false,
  connected_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sms_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_id uuid,
  phone_number_id uuid,
  from_number text NOT NULL,
  to_number text NOT NULL,
  body text NOT NULL,
  direction text NOT NULL,
  status text DEFAULT 'sent'::text,
  twilio_sid text,
  sent_at timestamp without time zone DEFAULT now(),
  read_at timestamp with time zone,
  intent_label text,
  intent_score numeric(3,2),
  thread_id uuid,
  is_opted_out boolean DEFAULT false,
  sms_thread_id uuid,
  intent text,
  intent_confidence numeric,
  is_hot boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.sms_threads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_id uuid,
  phone_number_id uuid,
  remote_number text NOT NULL,
  local_number text NOT NULL,
  last_message_at timestamp with time zone,
  last_message_body text,
  last_message_direction text,
  unread_count integer DEFAULT 0,
  is_opted_out boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  contact_name text,
  contact_phone text,
  direction text,
  last_message text,
  unread boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.snippets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trigger text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.social_platform_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid,
  platform text NOT NULL,
  account_name text,
  account_handle text,
  account_url text,
  followers integer DEFAULT 0,
  following integer DEFAULT 0,
  access_token_vault_id uuid,
  status text DEFAULT 'connected'::text,
  last_synced_at timestamp without time zone,
  notes text,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.social_posts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid,
  platform_account_id uuid,
  asset_id uuid,
  caption text,
  hashtags text,
  platforms text[] DEFAULT '{}'::text[],
  status text DEFAULT 'draft'::text,
  scheduled_at timestamp without time zone,
  published_at timestamp without time zone,
  post_url text,
  external_post_id text,
  engagement_likes integer DEFAULT 0,
  engagement_comments integer DEFAULT 0,
  engagement_shares integer DEFAULT 0,
  engagement_reach integer DEFAULT 0,
  notes text,
  ai_generated boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stack_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  service_name text NOT NULL,
  service_category text DEFAULT 'other'::text,
  service_url text,
  service_icon text,
  login_email text,
  login_username text,
  password_vault_id uuid,
  api_key_vault_id uuid,
  status text DEFAULT 'active'::text,
  trial_start date,
  trial_end date,
  auto_renew boolean DEFAULT true,
  cost numeric(10,2) DEFAULT 0,
  billing_cycle text DEFAULT 'monthly'::text,
  next_billing_date date,
  payment_method_label text,
  annual_cost numeric(10,2),
  notes text,
  tags text[] DEFAULT '{}'::text[],
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_id uuid,
  call_id uuid,
  campaign_id uuid,
  assigned_to uuid,
  title text NOT NULL,
  description text,
  task_type text DEFAULT 'follow_up'::text,
  priority text DEFAULT 'medium'::text,
  status text DEFAULT 'pending'::text,
  due_date timestamp without time zone,
  completed_at timestamp without time zone,
  ai_suggested boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now(),
  source text,
  source_id uuid,
  deleted_at timestamp with time zone,
  hour integer,
  minute integer,
  notes text
);

CREATE TABLE IF NOT EXISTS public.team_member_clients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL,
  client_id uuid NOT NULL,
  access_level text NOT NULL DEFAULT 'read'::text,
  granted_by uuid,
  granted_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  member_email text NOT NULL,
  member_user_id uuid,
  role text DEFAULT 'agent'::text,
  status text DEFAULT 'pending'::text,
  invited_at timestamp without time zone DEFAULT now(),
  accepted_at timestamp without time zone,
  first_name text,
  last_name text,
  title text,
  department text,
  hire_date date,
  start_date date,
  end_date date,
  contract_type text DEFAULT 'full_time'::text,
  pay_rate numeric(10,2),
  pay_type text DEFAULT 'salary'::text,
  pay_frequency text DEFAULT 'bi_weekly'::text,
  phone text,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  quota_monthly numeric(12,2),
  commission_rate numeric(5,2),
  notes text,
  avatar_url text,
  client_id uuid,
  portal_access boolean DEFAULT false,
  permissions jsonb DEFAULT '{}'::jsonb,
  stripe_connect_account_id text,
  stripe_connect_status text NOT NULL DEFAULT 'not_connected'::text,
  verbal_approved_at timestamp with time zone,
  verbal_approved_by uuid
);

CREATE TABLE IF NOT EXISTS public.teams_integrations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  webhook_url text NOT NULL,
  channel_name text,
  notify_new_leads boolean DEFAULT true,
  notify_calls boolean DEFAULT false,
  notify_deals boolean DEFAULT false,
  connected_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tech_stack_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  category text DEFAULT 'other'::text,
  monthly_cost numeric(10,2) DEFAULT 0,
  billing_cycle text DEFAULT 'monthly'::text,
  url text,
  notes text,
  project_ids uuid[] DEFAULT '{}'::uuid[],
  campaign_ids uuid[] DEFAULT '{}'::uuid[],
  active boolean DEFAULT true,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'email'::text,
  category text DEFAULT 'general'::text,
  subject text,
  body text NOT NULL,
  use_count integer DEFAULT 0,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.time_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid,
  project_id uuid,
  campaign_id uuid,
  description text,
  duration_minutes integer NOT NULL,
  billable boolean DEFAULT true,
  hourly_rate numeric(10,2),
  entry_date date DEFAULT CURRENT_DATE,
  created_at timestamp without time zone DEFAULT now(),
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  ended_at timestamp with time zone,
  duration_seconds integer
);

CREATE TABLE IF NOT EXISTS public.user_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sidebar_items jsonb,
  theme text DEFAULT 'dark'::text,
  notification_sounds boolean DEFAULT true,
  microphone_device_id text,
  speaker_device_id text,
  contact_default_type text DEFAULT 'lead'::text,
  contact_required_fields text[] DEFAULT ARRAY['name'::text, 'phone'::text],
  updated_at timestamp without time zone DEFAULT now(),
  dashboard_layout jsonb,
  spotify_tokens jsonb,
  widget_settings jsonb,
  access_token text,
  refresh_token text,
  scope text,
  expires_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_start timestamp without time zone DEFAULT now(),
  session_end timestamp without time zone,
  duration_seconds integer,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_name text,
  company_email text,
  company_phone text,
  company_website text,
  hourly_rate numeric(10,2) DEFAULT 150,
  currency text DEFAULT 'USD'::text,
  timezone text DEFAULT 'America/Chicago'::text,
  auto_record_calls boolean DEFAULT true,
  auto_transcribe_calls boolean DEFAULT true,
  email_voicemail_transcripts boolean DEFAULT false,
  working_hours_start text DEFAULT '08:00'::text,
  working_hours_end text DEFAULT '21:00'::text,
  working_days text[] DEFAULT ARRAY['Mon'::text, 'Tue'::text, 'Wed'::text, 'Thu'::text, 'Fri'::text],
  call_retry_limit integer DEFAULT 3,
  call_retry_interval_hours integer DEFAULT 24,
  default_from_number text,
  default_call_type text DEFAULT 'cold_call'::text,
  recording_compliance_message text,
  recording_compliance_enabled boolean DEFAULT false,
  notify_new_leads boolean DEFAULT true,
  notify_overdue_tasks boolean DEFAULT true,
  notify_missed_calls boolean DEFAULT true,
  notify_voicemails boolean DEFAULT true,
  notify_new_deals boolean DEFAULT true,
  daily_digest_email boolean DEFAULT false,
  smtp_host text,
  smtp_port integer DEFAULT 587,
  smtp_user text,
  smtp_pass_encrypted text,
  sms_auto_reply text,
  email_signature text,
  invoice_header text,
  invoice_footer text,
  invoice_logo_url text,
  agency_name text,
  agency_logo_url text,
  agency_website text,
  agency_phone text,
  agency_address text,
  auto_score_on_import boolean DEFAULT true,
  default_task_priority text DEFAULT 'medium'::text,
  data_retention_months integer DEFAULT 0,
  sidebar_hidden_items text[] DEFAULT ARRAY[]::text[],
  sidebar_item_order jsonb,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  twilio_account_sid text,
  twilio_auth_token text,
  twilio_api_key_sid text,
  twilio_api_key_secret text,
  twilio_twiml_app_sid text,
  twilio_client_identity text,
  twilio_phone_number text,
  subscription_tier text DEFAULT 'free'::text
);

CREATE TABLE IF NOT EXISTS public.voicemail_drops (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  audio_url text,
  duration_seconds integer,
  is_default boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.voicemails (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  phone_number_id uuid,
  caller_id text NOT NULL,
  caller_name text,
  duration_seconds integer,
  recording_url text,
  transcript text,
  status text DEFAULT 'unread'::text,
  received_at timestamp without time zone DEFAULT now(),
  listened_at timestamp without time zone
);

ALTER TABLE public.ad_campaigns_ext ADD CONSTRAINT ad_campaigns_ext_lead_campaign_id_fkey FOREIGN KEY (lead_campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;

ALTER TABLE public.ad_campaigns_ext ADD CONSTRAINT ad_campaigns_ext_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.ad_campaigns_ext ADD CONSTRAINT ad_campaigns_ext_pkey PRIMARY KEY (id);

ALTER TABLE public.ad_campaigns_ext ADD CONSTRAINT ad_campaigns_ext_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE public.api_key_vault ADD CONSTRAINT api_key_vault_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.api_key_vault ADD CONSTRAINT api_key_vault_pkey PRIMARY KEY (id);

ALTER TABLE public.api_tokens ADD CONSTRAINT api_tokens_token_hash_key UNIQUE (token_hash);

ALTER TABLE public.api_tokens ADD CONSTRAINT api_tokens_pkey PRIMARY KEY (id);

ALTER TABLE public.api_tokens ADD CONSTRAINT api_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.api_tokens ADD CONSTRAINT api_tokens_user_id_name_key UNIQUE (user_id, name);

ALTER TABLE public.api_usage_log ADD CONSTRAINT api_usage_log_call_id_fkey FOREIGN KEY (call_id) REFERENCES calls(id);

ALTER TABLE public.api_usage_log ADD CONSTRAINT api_usage_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.api_usage_log ADD CONSTRAINT api_usage_log_pkey PRIMARY KEY (id);

ALTER TABLE public.appointment_templates ADD CONSTRAINT appointment_templates_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

ALTER TABLE public.appointment_templates ADD CONSTRAINT appointment_templates_pkey PRIMARY KEY (id);

ALTER TABLE public.appointment_templates ADD CONSTRAINT appointment_templates_owner_user_id_campaign_id_key UNIQUE (owner_user_id, campaign_id);

ALTER TABLE public.appointments ADD CONSTRAINT appointments_call_id_fkey FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE SET NULL;

ALTER TABLE public.appointments ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);

ALTER TABLE public.appointments ADD CONSTRAINT appointments_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE public.appointments ADD CONSTRAINT appointments_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;

ALTER TABLE public.asset_shares ADD CONSTRAINT asset_shares_share_token_key UNIQUE (share_token);

ALTER TABLE public.asset_shares ADD CONSTRAINT asset_shares_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES marketing_assets(id) ON DELETE CASCADE;

ALTER TABLE public.asset_shares ADD CONSTRAINT asset_shares_pkey PRIMARY KEY (id);

ALTER TABLE public.asset_shares ADD CONSTRAINT asset_shares_shared_by_fkey FOREIGN KEY (shared_by) REFERENCES auth.users(id);

ALTER TABLE public.asset_versions ADD CONSTRAINT asset_versions_asset_id_version_key UNIQUE (asset_id, version);

ALTER TABLE public.asset_versions ADD CONSTRAINT asset_versions_pkey PRIMARY KEY (id);

ALTER TABLE public.asset_versions ADD CONSTRAINT asset_versions_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);

ALTER TABLE public.asset_versions ADD CONSTRAINT asset_versions_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES marketing_assets(id) ON DELETE CASCADE;

ALTER TABLE public.automation_rules ADD CONSTRAINT automation_rules_pkey PRIMARY KEY (id);

ALTER TABLE public.automation_rules ADD CONSTRAINT automation_rules_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.balance_entries ADD CONSTRAINT balance_entries_user_id_entry_date_key UNIQUE (user_id, entry_date);

ALTER TABLE public.balance_entries ADD CONSTRAINT balance_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.balance_entries ADD CONSTRAINT balance_entries_pkey PRIMARY KEY (id);

ALTER TABLE public.budget_entries ADD CONSTRAINT budget_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.budget_entries ADD CONSTRAINT budget_entries_pkey PRIMARY KEY (id);

ALTER TABLE public.call_feedback ADD CONSTRAINT call_feedback_rating_check CHECK (((rating >= 1) AND (rating <= 5)));

ALTER TABLE public.call_feedback ADD CONSTRAINT call_feedback_pkey PRIMARY KEY (id);

ALTER TABLE public.call_feedback ADD CONSTRAINT call_feedback_call_id_fkey FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE;

ALTER TABLE public.call_list_contacts ADD CONSTRAINT call_list_contacts_call_list_id_contact_id_key UNIQUE (call_list_id, contact_id);

ALTER TABLE public.call_list_contacts ADD CONSTRAINT call_list_contacts_pkey PRIMARY KEY (id);

ALTER TABLE public.call_list_contacts ADD CONSTRAINT call_list_contacts_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE public.call_list_contacts ADD CONSTRAINT call_list_contacts_call_list_id_fkey FOREIGN KEY (call_list_id) REFERENCES call_lists(id) ON DELETE CASCADE;

ALTER TABLE public.call_lists ADD CONSTRAINT call_lists_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

ALTER TABLE public.call_lists ADD CONSTRAINT call_lists_pkey PRIMARY KEY (id);

ALTER TABLE public.call_lists ADD CONSTRAINT call_lists_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE public.calls ADD CONSTRAINT calls_phone_number_id_fkey FOREIGN KEY (phone_number_id) REFERENCES phone_numbers(id);

ALTER TABLE public.calls ADD CONSTRAINT calls_pkey PRIMARY KEY (id);

ALTER TABLE public.calls ADD CONSTRAINT calls_call_list_id_fkey FOREIGN KEY (call_list_id) REFERENCES call_lists(id);

ALTER TABLE public.calls ADD CONSTRAINT calls_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.calls ADD CONSTRAINT calls_script_id_fkey FOREIGN KEY (script_id) REFERENCES scripts(id);

ALTER TABLE public.calls ADD CONSTRAINT calls_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id);

ALTER TABLE public.calls ADD CONSTRAINT calls_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id);

ALTER TABLE public.campaign_contacts ADD CONSTRAINT campaign_contacts_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE public.campaign_contacts ADD CONSTRAINT campaign_contacts_pkey PRIMARY KEY (id);

ALTER TABLE public.campaign_contacts ADD CONSTRAINT campaign_contacts_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

ALTER TABLE public.campaign_contacts ADD CONSTRAINT campaign_contacts_campaign_id_contact_id_key UNIQUE (campaign_id, contact_id);

ALTER TABLE public.campaign_goals ADD CONSTRAINT campaign_goals_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

ALTER TABLE public.campaign_goals ADD CONSTRAINT campaign_goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.campaign_goals ADD CONSTRAINT campaign_goals_pkey PRIMARY KEY (id);

ALTER TABLE public.campaign_goals ADD CONSTRAINT campaign_goals_campaign_id_goal_type_period_key UNIQUE (campaign_id, goal_type, period);

ALTER TABLE public.campaign_sdrs ADD CONSTRAINT campaign_sdrs_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

ALTER TABLE public.campaign_sdrs ADD CONSTRAINT campaign_sdrs_sdr_id_fkey FOREIGN KEY (sdr_id) REFERENCES team_members(id) ON DELETE CASCADE;

ALTER TABLE public.campaign_sdrs ADD CONSTRAINT campaign_sdrs_campaign_id_sdr_id_key UNIQUE (campaign_id, sdr_id);

ALTER TABLE public.campaign_sdrs ADD CONSTRAINT campaign_sdrs_pkey PRIMARY KEY (id);

ALTER TABLE public.campaign_wins ADD CONSTRAINT campaign_wins_call_id_fkey FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE SET NULL;

ALTER TABLE public.campaign_wins ADD CONSTRAINT campaign_wins_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

ALTER TABLE public.campaign_wins ADD CONSTRAINT campaign_wins_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE public.campaign_wins ADD CONSTRAINT campaign_wins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.campaign_wins ADD CONSTRAINT campaign_wins_pkey PRIMARY KEY (id);

ALTER TABLE public.campaign_wins ADD CONSTRAINT campaign_wins_campaign_id_contact_id_outcome_key UNIQUE (campaign_id, contact_id, outcome);

ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_from_email_account_id_fkey FOREIGN KEY (from_email_account_id) REFERENCES email_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_email_sequence_id_fkey FOREIGN KEY (email_sequence_id) REFERENCES email_sequences(id) ON DELETE SET NULL;

ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_from_phone_number_id_fkey FOREIGN KEY (from_phone_number_id) REFERENCES phone_numbers(id) ON DELETE SET NULL;

ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);

ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE public.channel_participants ADD CONSTRAINT channel_participants_pkey PRIMARY KEY (id);

ALTER TABLE public.channel_participants ADD CONSTRAINT channel_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.channel_participants ADD CONSTRAINT channel_participants_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES message_channels(id) ON DELETE CASCADE;

ALTER TABLE public.channel_participants ADD CONSTRAINT channel_participants_channel_id_user_id_key UNIQUE (channel_id, user_id);

ALTER TABLE public.client_docs ADD CONSTRAINT client_docs_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE public.client_docs ADD CONSTRAINT client_docs_pkey PRIMARY KEY (id);

ALTER TABLE public.client_knowledge ADD CONSTRAINT client_knowledge_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE public.client_knowledge ADD CONSTRAINT client_knowledge_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.client_knowledge ADD CONSTRAINT client_knowledge_pkey PRIMARY KEY (id);

ALTER TABLE public.clients ADD CONSTRAINT clients_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.clients ADD CONSTRAINT clients_pkey PRIMARY KEY (id);

ALTER TABLE public.companies ADD CONSTRAINT companies_pkey PRIMARY KEY (id);

ALTER TABLE public.companies ADD CONSTRAINT companies_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE public.companies ADD CONSTRAINT companies_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.contact_activities ADD CONSTRAINT contact_activities_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE public.contact_activities ADD CONSTRAINT contact_activities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.contact_activities ADD CONSTRAINT contact_activities_pkey PRIMARY KEY (id);

ALTER TABLE public.contact_campaign_assoc ADD CONSTRAINT contact_campaign_assoc_pkey PRIMARY KEY (id);

ALTER TABLE public.contact_campaign_assoc ADD CONSTRAINT contact_campaign_assoc_contact_id_campaign_id_key UNIQUE (contact_id, campaign_id);

ALTER TABLE public.contact_campaign_assoc ADD CONSTRAINT contact_campaign_assoc_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

ALTER TABLE public.contact_campaign_assoc ADD CONSTRAINT contact_campaign_assoc_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.contact_campaign_assoc ADD CONSTRAINT contact_campaign_assoc_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE public.contact_client_assoc ADD CONSTRAINT contact_client_assoc_contact_id_client_id_key UNIQUE (contact_id, client_id);

ALTER TABLE public.contact_client_assoc ADD CONSTRAINT contact_client_assoc_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE public.contact_client_assoc ADD CONSTRAINT contact_client_assoc_pkey PRIMARY KEY (id);

ALTER TABLE public.contact_client_assoc ADD CONSTRAINT contact_client_assoc_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.contact_client_assoc ADD CONSTRAINT contact_client_assoc_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE public.contact_documents ADD CONSTRAINT contact_documents_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE public.contact_documents ADD CONSTRAINT contact_documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.contact_documents ADD CONSTRAINT contact_documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

ALTER TABLE public.contact_documents ADD CONSTRAINT contact_documents_pkey PRIMARY KEY (id);

ALTER TABLE public.contact_documents ADD CONSTRAINT contact_documents_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE;

ALTER TABLE public.contact_documents ADD CONSTRAINT contact_documents_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE public.contact_enrichments ADD CONSTRAINT contact_enrichments_pkey PRIMARY KEY (id);

ALTER TABLE public.contact_enrichments ADD CONSTRAINT contact_enrichments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.contact_enrichments ADD CONSTRAINT contact_enrichments_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id);

ALTER TABLE public.contact_field_definitions ADD CONSTRAINT contact_field_definitions_pkey PRIMARY KEY (id);

ALTER TABLE public.contact_field_definitions ADD CONSTRAINT contact_field_definitions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.contact_field_definitions ADD CONSTRAINT contact_field_definitions_user_id_field_key_key UNIQUE (user_id, field_key);

ALTER TABLE public.contact_field_values ADD CONSTRAINT contact_field_values_pkey PRIMARY KEY (id);

ALTER TABLE public.contact_field_values ADD CONSTRAINT contact_field_values_field_definition_id_fkey FOREIGN KEY (field_definition_id) REFERENCES contact_field_definitions(id) ON DELETE CASCADE;

ALTER TABLE public.contact_field_values ADD CONSTRAINT contact_field_values_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE public.contact_field_values ADD CONSTRAINT contact_field_values_contact_id_field_definition_id_key UNIQUE (contact_id, field_definition_id);

ALTER TABLE public.contact_filters ADD CONSTRAINT contact_filters_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.contact_filters ADD CONSTRAINT contact_filters_user_id_name_key UNIQUE (user_id, name);

ALTER TABLE public.contact_filters ADD CONSTRAINT contact_filters_pkey PRIMARY KEY (id);

ALTER TABLE public.contact_inquiries ADD CONSTRAINT contact_inquiries_pkey PRIMARY KEY (id);

ALTER TABLE public.contact_project_assoc ADD CONSTRAINT contact_project_assoc_contact_id_project_id_key UNIQUE (contact_id, project_id);

ALTER TABLE public.contact_project_assoc ADD CONSTRAINT contact_project_assoc_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE public.contact_project_assoc ADD CONSTRAINT contact_project_assoc_pkey PRIMARY KEY (id);

ALTER TABLE public.contact_project_assoc ADD CONSTRAINT contact_project_assoc_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE public.contact_project_assoc ADD CONSTRAINT contact_project_assoc_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.contact_sequences ADD CONSTRAINT contact_sequences_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;

ALTER TABLE public.contact_sequences ADD CONSTRAINT contact_sequences_sequence_id_fkey FOREIGN KEY (sequence_id) REFERENCES email_sequences(id);

ALTER TABLE public.contact_sequences ADD CONSTRAINT contact_sequences_pkey PRIMARY KEY (id);

ALTER TABLE public.contact_sequences ADD CONSTRAINT contact_sequences_contact_id_sequence_id_key UNIQUE (contact_id, sequence_id);

ALTER TABLE public.contact_sequences ADD CONSTRAINT contact_sequences_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE public.contact_tag_mappings ADD CONSTRAINT contact_tag_mappings_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE public.contact_tag_mappings ADD CONSTRAINT contact_tag_mappings_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES contact_tags(id) ON DELETE CASCADE;

ALTER TABLE public.contact_tag_mappings ADD CONSTRAINT contact_tag_mappings_pkey PRIMARY KEY (id);

ALTER TABLE public.contact_tag_mappings ADD CONSTRAINT contact_tag_mappings_contact_id_tag_id_key UNIQUE (contact_id, tag_id);

ALTER TABLE public.contact_tags ADD CONSTRAINT contact_tags_pkey PRIMARY KEY (id);

ALTER TABLE public.contact_tags ADD CONSTRAINT contact_tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.contact_tags ADD CONSTRAINT contact_tags_user_id_name_key UNIQUE (user_id, name);

ALTER TABLE public.contacts ADD CONSTRAINT contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.contacts ADD CONSTRAINT contacts_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE public.contacts ADD CONSTRAINT contacts_lead_source_id_fkey FOREIGN KEY (lead_source_id) REFERENCES lead_sources(id) ON DELETE SET NULL;

ALTER TABLE public.contacts ADD CONSTRAINT contacts_import_batch_id_fkey FOREIGN KEY (import_batch_id) REFERENCES import_batches(id);

ALTER TABLE public.contacts ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);

ALTER TABLE public.cron_logs ADD CONSTRAINT cron_logs_pkey PRIMARY KEY (id);

ALTER TABLE public.cron_logs ADD CONSTRAINT cron_logs_job_name_key UNIQUE (job_name);

ALTER TABLE public.deals ADD CONSTRAINT deals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.deals ADD CONSTRAINT deals_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id);

ALTER TABLE public.deals ADD CONSTRAINT deals_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);

ALTER TABLE public.deals ADD CONSTRAINT deals_pkey PRIMARY KEY (id);

ALTER TABLE public.deals ADD CONSTRAINT deals_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id);

ALTER TABLE public.dialer_activity ADD CONSTRAINT dialer_activity_session_id_fkey FOREIGN KEY (session_id) REFERENCES user_sessions(id);

ALTER TABLE public.dialer_activity ADD CONSTRAINT dialer_activity_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE public.dialer_activity ADD CONSTRAINT dialer_activity_call_id_fkey FOREIGN KEY (call_id) REFERENCES calls(id);

ALTER TABLE public.dialer_activity ADD CONSTRAINT dialer_activity_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id);

ALTER TABLE public.dialer_activity ADD CONSTRAINT dialer_activity_pkey PRIMARY KEY (id);

ALTER TABLE public.dialer_activity ADD CONSTRAINT dialer_activity_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.email_accounts ADD CONSTRAINT email_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.email_accounts ADD CONSTRAINT email_accounts_user_email_unique UNIQUE (user_id, email_address);

ALTER TABLE public.email_accounts ADD CONSTRAINT email_accounts_pkey PRIMARY KEY (id);

ALTER TABLE public.email_accounts ADD CONSTRAINT email_accounts_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_message_id_key UNIQUE (message_id);

ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id);

ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_pkey PRIMARY KEY (id);

ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_email_thread_id_fkey FOREIGN KEY (email_thread_id) REFERENCES email_threads(id) ON DELETE SET NULL;

ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id);

ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;

ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_call_id_fkey FOREIGN KEY (call_id) REFERENCES calls(id);

ALTER TABLE public.email_sequences ADD CONSTRAINT email_sequences_pkey PRIMARY KEY (id);

ALTER TABLE public.email_sequences ADD CONSTRAINT email_sequences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.email_threads ADD CONSTRAINT email_threads_pkey PRIMARY KEY (id);

ALTER TABLE public.email_threads ADD CONSTRAINT email_threads_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;

ALTER TABLE public.email_threads ADD CONSTRAINT email_threads_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id);

ALTER TABLE public.email_threads ADD CONSTRAINT email_threads_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.email_threads ADD CONSTRAINT email_threads_user_id_thread_key_contact_id_key UNIQUE (user_id, thread_key, contact_id);

ALTER TABLE public.engagements ADD CONSTRAINT engagements_owner_user_id_client_id_sdr_user_id_key UNIQUE (owner_user_id, client_id, sdr_user_id);

ALTER TABLE public.engagements ADD CONSTRAINT engagements_sdr_user_id_fkey FOREIGN KEY (sdr_user_id) REFERENCES auth.users(id);

ALTER TABLE public.engagements ADD CONSTRAINT engagements_pkey PRIMARY KEY (id);

ALTER TABLE public.engagements ADD CONSTRAINT engagements_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE public.generated_reports ADD CONSTRAINT generated_reports_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE public.generated_reports ADD CONSTRAINT generated_reports_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);

ALTER TABLE public.generated_reports ADD CONSTRAINT generated_reports_pkey PRIMARY KEY (id);

ALTER TABLE public.generated_reports ADD CONSTRAINT generated_reports_share_token_key UNIQUE (share_token);

ALTER TABLE public.generated_reports ADD CONSTRAINT generated_reports_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id);

ALTER TABLE public.generated_reports ADD CONSTRAINT generated_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.import_batches ADD CONSTRAINT import_batches_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.import_batches ADD CONSTRAINT import_batches_pkey PRIMARY KEY (id);

ALTER TABLE public.invoices ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);

ALTER TABLE public.invoices ADD CONSTRAINT invoices_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.invoices ADD CONSTRAINT invoices_report_id_fkey FOREIGN KEY (report_id) REFERENCES generated_reports(id);

ALTER TABLE public.invoices ADD CONSTRAINT invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);

ALTER TABLE public.lead_routing_rules ADD CONSTRAINT lead_routing_rules_pkey PRIMARY KEY (id);

ALTER TABLE public.lead_routing_rules ADD CONSTRAINT lead_routing_rules_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.lead_routing_rules ADD CONSTRAINT lead_routing_rules_lead_source_id_fkey FOREIGN KEY (lead_source_id) REFERENCES lead_sources(id) ON DELETE CASCADE;

ALTER TABLE public.lead_sources ADD CONSTRAINT lead_sources_pkey PRIMARY KEY (id);

ALTER TABLE public.lead_sources ADD CONSTRAINT lead_sources_webhook_token_key UNIQUE (webhook_token);

ALTER TABLE public.lead_sources ADD CONSTRAINT lead_sources_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.lead_sources ADD CONSTRAINT lead_sources_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE public.lead_sources ADD CONSTRAINT lead_sources_auto_call_list_id_fkey FOREIGN KEY (auto_call_list_id) REFERENCES call_lists(id);

ALTER TABLE public.lead_sources ADD CONSTRAINT lead_sources_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id);

ALTER TABLE public.lead_sources ADD CONSTRAINT lead_sources_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);

ALTER TABLE public.login_activity ADD CONSTRAINT login_activity_pkey PRIMARY KEY (id);

ALTER TABLE public.login_activity ADD CONSTRAINT login_activity_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.marketing_assets ADD CONSTRAINT marketing_assets_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id);

ALTER TABLE public.marketing_assets ADD CONSTRAINT marketing_assets_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;

ALTER TABLE public.marketing_assets ADD CONSTRAINT marketing_assets_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE public.marketing_assets ADD CONSTRAINT marketing_assets_parent_asset_id_fkey FOREIGN KEY (parent_asset_id) REFERENCES marketing_assets(id) ON DELETE SET NULL;

ALTER TABLE public.marketing_assets ADD CONSTRAINT marketing_assets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.marketing_assets ADD CONSTRAINT marketing_assets_pkey PRIMARY KEY (id);

ALTER TABLE public.marketing_assets ADD CONSTRAINT marketing_assets_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);

ALTER TABLE public.message_channels ADD CONSTRAINT message_channels_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

ALTER TABLE public.message_channels ADD CONSTRAINT message_channels_pkey PRIMARY KEY (id);

ALTER TABLE public.message_channels ADD CONSTRAINT message_channels_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);

ALTER TABLE public.messages ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id);

ALTER TABLE public.messages ADD CONSTRAINT messages_pkey PRIMARY KEY (id);

ALTER TABLE public.messages ADD CONSTRAINT messages_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES message_channels(id) ON DELETE CASCADE;

ALTER TABLE public.missed_calls ADD CONSTRAINT missed_calls_phone_number_id_fkey FOREIGN KEY (phone_number_id) REFERENCES phone_numbers(id);

ALTER TABLE public.missed_calls ADD CONSTRAINT missed_calls_pkey PRIMARY KEY (id);

ALTER TABLE public.missed_calls ADD CONSTRAINT missed_calls_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.outbound_webhooks ADD CONSTRAINT outbound_webhooks_pkey PRIMARY KEY (id);

ALTER TABLE public.outbound_webhooks ADD CONSTRAINT outbound_webhooks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.password_vault ADD CONSTRAINT password_vault_pkey PRIMARY KEY (id);

ALTER TABLE public.password_vault ADD CONSTRAINT password_vault_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.payouts ADD CONSTRAINT payouts_team_member_id_fkey FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE SET NULL;

ALTER TABLE public.payouts ADD CONSTRAINT payouts_call_id_fkey FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE SET NULL;

ALTER TABLE public.payouts ADD CONSTRAINT payouts_pkey PRIMARY KEY (id);

ALTER TABLE public.payroll_entries ADD CONSTRAINT payroll_entries_team_member_id_fkey FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE CASCADE;

ALTER TABLE public.payroll_entries ADD CONSTRAINT payroll_entries_pkey PRIMARY KEY (id);

ALTER TABLE public.payroll_entries ADD CONSTRAINT payroll_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.phone_numbers ADD CONSTRAINT phone_numbers_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.phone_numbers ADD CONSTRAINT phone_numbers_user_id_phone_number_key UNIQUE (user_id, phone_number);

ALTER TABLE public.phone_numbers ADD CONSTRAINT phone_numbers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.phone_numbers ADD CONSTRAINT phone_numbers_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);

ALTER TABLE public.phone_numbers ADD CONSTRAINT phone_numbers_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id);

ALTER TABLE public.phone_numbers ADD CONSTRAINT phone_numbers_pkey PRIMARY KEY (id);

ALTER TABLE public.platform_admins ADD CONSTRAINT platform_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.platform_admins ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (user_id);

ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.projects ADD CONSTRAINT projects_from_email_account_id_fkey FOREIGN KEY (from_email_account_id) REFERENCES email_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.projects ADD CONSTRAINT projects_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE public.projects ADD CONSTRAINT projects_pkey PRIMARY KEY (id);

ALTER TABLE public.projects ADD CONSTRAINT projects_from_phone_number_id_fkey FOREIGN KEY (from_phone_number_id) REFERENCES phone_numbers(id) ON DELETE SET NULL;

ALTER TABLE public.quotas ADD CONSTRAINT quotas_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.quotas ADD CONSTRAINT quotas_pkey PRIMARY KEY (id);

ALTER TABLE public.quotas ADD CONSTRAINT quotas_user_id_quota_type_period_start_key UNIQUE (user_id, quota_type, period_start);

ALTER TABLE public.rep_interview_answers ADD CONSTRAINT rep_interview_answers_pkey PRIMARY KEY (id);

ALTER TABLE public.rep_interview_answers ADD CONSTRAINT rep_interview_answers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.rep_profiles ADD CONSTRAINT rep_profiles_user_id_key UNIQUE (user_id);

ALTER TABLE public.rep_profiles ADD CONSTRAINT rep_profiles_pkey PRIMARY KEY (id);

ALTER TABLE public.rep_profiles ADD CONSTRAINT rep_profiles_username_key UNIQUE (username);

ALTER TABLE public.rep_profiles ADD CONSTRAINT rep_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.rep_supercut_clips ADD CONSTRAINT rep_supercut_clips_call_id_fkey FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE SET NULL;

ALTER TABLE public.rep_supercut_clips ADD CONSTRAINT rep_supercut_clips_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.rep_supercut_clips ADD CONSTRAINT rep_supercut_clips_pkey PRIMARY KEY (id);

ALTER TABLE public.rep_testimonials ADD CONSTRAINT rep_testimonials_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.rep_testimonials ADD CONSTRAINT rep_testimonials_pkey PRIMARY KEY (id);

ALTER TABLE public.scraped_contacts ADD CONSTRAINT scraped_contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.scraped_contacts ADD CONSTRAINT scraped_contacts_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;

ALTER TABLE public.scraped_contacts ADD CONSTRAINT scraped_contacts_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id);

ALTER TABLE public.scraped_contacts ADD CONSTRAINT scraped_contacts_pkey PRIMARY KEY (id);

ALTER TABLE public.scraped_contacts ADD CONSTRAINT scraped_contacts_call_list_id_fkey FOREIGN KEY (call_list_id) REFERENCES call_lists(id) ON DELETE SET NULL;

ALTER TABLE public.script_objection_logs ADD CONSTRAINT script_objection_logs_call_id_fkey FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE;

ALTER TABLE public.script_objection_logs ADD CONSTRAINT script_objection_logs_script_id_fkey FOREIGN KEY (script_id) REFERENCES scripts(id);

ALTER TABLE public.script_objection_logs ADD CONSTRAINT script_objection_logs_pkey PRIMARY KEY (id);

ALTER TABLE public.script_objection_logs ADD CONSTRAINT script_objection_logs_objection_id_fkey FOREIGN KEY (objection_id) REFERENCES script_objections(id);

ALTER TABLE public.script_objections ADD CONSTRAINT script_objections_script_id_fkey FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE;

ALTER TABLE public.script_objections ADD CONSTRAINT script_objections_pkey PRIMARY KEY (id);

ALTER TABLE public.scripts ADD CONSTRAINT scripts_pkey PRIMARY KEY (id);

ALTER TABLE public.scripts ADD CONSTRAINT scripts_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id);

ALTER TABLE public.scripts ADD CONSTRAINT scripts_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);

ALTER TABLE public.scripts ADD CONSTRAINT scripts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.sequence_steps ADD CONSTRAINT sequence_steps_pkey PRIMARY KEY (id);

ALTER TABLE public.sequence_steps ADD CONSTRAINT sequence_steps_sequence_id_fkey FOREIGN KEY (sequence_id) REFERENCES email_sequences(id) ON DELETE CASCADE;

ALTER TABLE public.slack_integrations ADD CONSTRAINT slack_integrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.slack_integrations ADD CONSTRAINT slack_integrations_user_id_key UNIQUE (user_id);

ALTER TABLE public.slack_integrations ADD CONSTRAINT slack_integrations_pkey PRIMARY KEY (id);

ALTER TABLE public.slack_integrations ADD CONSTRAINT slack_integrations_bot_token_vault_id_fkey FOREIGN KEY (bot_token_vault_id) REFERENCES api_key_vault(id);

ALTER TABLE public.sms_logs ADD CONSTRAINT sms_logs_sms_thread_id_fkey FOREIGN KEY (sms_thread_id) REFERENCES sms_threads(id) ON DELETE SET NULL;

ALTER TABLE public.sms_logs ADD CONSTRAINT sms_logs_pkey PRIMARY KEY (id);

ALTER TABLE public.sms_logs ADD CONSTRAINT sms_logs_phone_number_id_fkey FOREIGN KEY (phone_number_id) REFERENCES phone_numbers(id);

ALTER TABLE public.sms_logs ADD CONSTRAINT sms_logs_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id);

ALTER TABLE public.sms_logs ADD CONSTRAINT sms_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.sms_threads ADD CONSTRAINT sms_threads_phone_number_id_fkey FOREIGN KEY (phone_number_id) REFERENCES phone_numbers(id) ON DELETE SET NULL;

ALTER TABLE public.sms_threads ADD CONSTRAINT sms_threads_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;

ALTER TABLE public.sms_threads ADD CONSTRAINT sms_threads_user_id_remote_number_local_number_key UNIQUE (user_id, remote_number, local_number);

ALTER TABLE public.sms_threads ADD CONSTRAINT sms_threads_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.sms_threads ADD CONSTRAINT sms_threads_pkey PRIMARY KEY (id);

ALTER TABLE public.snippets ADD CONSTRAINT snippets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.snippets ADD CONSTRAINT snippets_pkey PRIMARY KEY (id);

ALTER TABLE public.snippets ADD CONSTRAINT snippets_user_id_trigger_key UNIQUE (user_id, trigger);

ALTER TABLE public.social_platform_accounts ADD CONSTRAINT social_platform_accounts_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE public.social_platform_accounts ADD CONSTRAINT social_platform_accounts_pkey PRIMARY KEY (id);

ALTER TABLE public.social_platform_accounts ADD CONSTRAINT social_platform_accounts_user_id_client_id_platform_key UNIQUE (user_id, client_id, platform);

ALTER TABLE public.social_platform_accounts ADD CONSTRAINT social_platform_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.social_platform_accounts ADD CONSTRAINT social_platform_accounts_access_token_vault_id_fkey FOREIGN KEY (access_token_vault_id) REFERENCES api_key_vault(id) ON DELETE SET NULL;

ALTER TABLE public.social_posts ADD CONSTRAINT social_posts_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES marketing_assets(id) ON DELETE SET NULL;

ALTER TABLE public.social_posts ADD CONSTRAINT social_posts_pkey PRIMARY KEY (id);

ALTER TABLE public.social_posts ADD CONSTRAINT social_posts_platform_account_id_fkey FOREIGN KEY (platform_account_id) REFERENCES social_platform_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.social_posts ADD CONSTRAINT social_posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.social_posts ADD CONSTRAINT social_posts_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE public.stack_accounts ADD CONSTRAINT stack_accounts_api_key_vault_id_fkey FOREIGN KEY (api_key_vault_id) REFERENCES api_key_vault(id) ON DELETE SET NULL;

ALTER TABLE public.stack_accounts ADD CONSTRAINT stack_accounts_password_vault_id_fkey FOREIGN KEY (password_vault_id) REFERENCES password_vault(id) ON DELETE SET NULL;

ALTER TABLE public.stack_accounts ADD CONSTRAINT stack_accounts_pkey PRIMARY KEY (id);

ALTER TABLE public.stack_accounts ADD CONSTRAINT stack_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.tasks ADD CONSTRAINT tasks_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id);

ALTER TABLE public.tasks ADD CONSTRAINT tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.tasks ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);

ALTER TABLE public.tasks ADD CONSTRAINT tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id);

ALTER TABLE public.tasks ADD CONSTRAINT tasks_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id);

ALTER TABLE public.tasks ADD CONSTRAINT tasks_call_id_fkey FOREIGN KEY (call_id) REFERENCES calls(id);

ALTER TABLE public.team_member_clients ADD CONSTRAINT team_member_clients_pkey PRIMARY KEY (id);

ALTER TABLE public.team_member_clients ADD CONSTRAINT team_member_clients_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE public.team_member_clients ADD CONSTRAINT team_member_clients_team_member_id_fkey FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE CASCADE;

ALTER TABLE public.team_member_clients ADD CONSTRAINT team_member_clients_team_member_id_client_id_key UNIQUE (team_member_id, client_id);

ALTER TABLE public.team_member_clients ADD CONSTRAINT team_member_clients_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id);

ALTER TABLE public.team_members ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);

ALTER TABLE public.team_members ADD CONSTRAINT team_members_member_user_id_fkey FOREIGN KEY (member_user_id) REFERENCES auth.users(id);

ALTER TABLE public.team_members ADD CONSTRAINT team_members_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE public.team_members ADD CONSTRAINT team_members_owner_user_id_member_email_key UNIQUE (owner_user_id, member_email);

ALTER TABLE public.team_members ADD CONSTRAINT team_members_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id);

ALTER TABLE public.teams_integrations ADD CONSTRAINT teams_integrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.teams_integrations ADD CONSTRAINT teams_integrations_user_id_key UNIQUE (user_id);

ALTER TABLE public.teams_integrations ADD CONSTRAINT teams_integrations_pkey PRIMARY KEY (id);

ALTER TABLE public.tech_stack_items ADD CONSTRAINT tech_stack_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.tech_stack_items ADD CONSTRAINT tech_stack_items_pkey PRIMARY KEY (id);

ALTER TABLE public.templates ADD CONSTRAINT templates_pkey PRIMARY KEY (id);

ALTER TABLE public.templates ADD CONSTRAINT templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_pkey PRIMARY KEY (id);

ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);

ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id);

ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_user_id_key UNIQUE (user_id);

ALTER TABLE public.user_preferences ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (id);

ALTER TABLE public.user_sessions ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);

ALTER TABLE public.user_sessions ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_pkey PRIMARY KEY (id);

ALTER TABLE public.user_settings ADD CONSTRAINT user_settings_user_id_key UNIQUE (user_id);

ALTER TABLE public.voicemail_drops ADD CONSTRAINT voicemail_drops_pkey PRIMARY KEY (id);

ALTER TABLE public.voicemail_drops ADD CONSTRAINT voicemail_drops_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public.voicemails ADD CONSTRAINT voicemails_pkey PRIMARY KEY (id);

ALTER TABLE public.voicemails ADD CONSTRAINT voicemails_phone_number_id_fkey FOREIGN KEY (phone_number_id) REFERENCES phone_numbers(id);

ALTER TABLE public.voicemails ADD CONSTRAINT voicemails_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

CREATE INDEX idx_ad_campaigns_ext_client ON public.ad_campaigns_ext USING btree (client_id);

CREATE INDEX idx_ad_campaigns_ext_user ON public.ad_campaigns_ext USING btree (user_id);

CREATE INDEX idx_api_key_vault_user ON public.api_key_vault USING btree (user_id);

CREATE INDEX idx_api_tokens_user ON public.api_tokens USING btree (user_id);

CREATE INDEX idx_api_usage_user ON public.api_usage_log USING btree (user_id);

CREATE INDEX idx_api_usage_call ON public.api_usage_log USING btree (call_id);

CREATE INDEX idx_api_usage_created ON public.api_usage_log USING btree (created_at);

CREATE INDEX idx_appointments_contact ON public.appointments USING btree (contact_id);

CREATE INDEX idx_appointments_owner ON public.appointments USING btree (owner_user_id, scheduled_at);

CREATE INDEX idx_asset_shares_asset ON public.asset_shares USING btree (asset_id);

CREATE INDEX idx_asset_shares_shared_by ON public.asset_shares USING btree (shared_by);

CREATE INDEX idx_asset_shares_expiry ON public.asset_shares USING btree (expires_at) WHERE (is_revoked = false);

CREATE INDEX idx_asset_shares_token ON public.asset_shares USING btree (share_token) WHERE (is_revoked = false);

CREATE INDEX idx_asset_versions_asset ON public.asset_versions USING btree (asset_id, version DESC);

CREATE INDEX idx_asset_versions_uploaded_by ON public.asset_versions USING btree (uploaded_by);

CREATE INDEX idx_automation_rules_user ON public.automation_rules USING btree (user_id);

CREATE INDEX idx_balance_entries_user ON public.balance_entries USING btree (user_id);

CREATE INDEX idx_balance_entries_date ON public.balance_entries USING btree (entry_date);

CREATE INDEX idx_budget_entries_type ON public.budget_entries USING btree (entry_type);

CREATE INDEX idx_budget_entries_user ON public.budget_entries USING btree (user_id);

CREATE INDEX call_feedback_call_id_idx ON public.call_feedback USING btree (call_id);

CREATE INDEX idx_call_list_contacts_contact ON public.call_list_contacts USING btree (contact_id);

CREATE INDEX idx_clc_next_follow_up ON public.call_list_contacts USING btree (next_follow_up_at) WHERE ((next_follow_up_at IS NOT NULL) AND (cadence_complete = false));

CREATE INDEX idx_call_list_contacts_list ON public.call_list_contacts USING btree (call_list_id);

CREATE INDEX idx_call_lists_campaign ON public.call_lists USING btree (campaign_id);

CREATE INDEX idx_call_lists_project ON public.call_lists USING btree (project_id);

CREATE INDEX idx_calls_user ON public.calls USING btree (user_id);

CREATE INDEX idx_calls_created ON public.calls USING btree (created_at);

CREATE INDEX idx_calls_type ON public.calls USING btree (call_type);

CREATE INDEX idx_calls_outcome ON public.calls USING btree (outcome);

CREATE INDEX idx_calls_twilio_sid ON public.calls USING btree (twilio_call_sid);

CREATE INDEX idx_calls_contact ON public.calls USING btree (contact_id);

CREATE INDEX idx_calls_script ON public.calls USING btree (script_id);

CREATE INDEX idx_campaign_contacts_campaign ON public.campaign_contacts USING btree (campaign_id);

CREATE INDEX idx_campaign_contacts_contact ON public.campaign_contacts USING btree (contact_id);

CREATE INDEX idx_campaign_goals_campaign ON public.campaign_goals USING btree (campaign_id);

CREATE INDEX idx_campaign_sdrs_sdr ON public.campaign_sdrs USING btree (sdr_id);

CREATE INDEX idx_campaign_sdrs_campaign ON public.campaign_sdrs USING btree (campaign_id);

CREATE INDEX idx_campaign_wins_campaign ON public.campaign_wins USING btree (campaign_id);

CREATE INDEX idx_campaign_wins_contact ON public.campaign_wins USING btree (contact_id);

CREATE INDEX idx_campaign_wins_user ON public.campaign_wins USING btree (user_id);

CREATE INDEX idx_campaigns_type ON public.campaigns USING btree (campaign_type);

CREATE INDEX idx_campaigns_project ON public.campaigns USING btree (project_id);

CREATE INDEX idx_campaigns_deleted_at ON public.campaigns USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);

CREATE INDEX idx_channel_participants_user ON public.channel_participants USING btree (user_id);

CREATE INDEX idx_client_docs_client ON public.client_docs USING btree (client_id);

CREATE INDEX idx_client_knowledge_client ON public.client_knowledge USING btree (client_id);

CREATE INDEX idx_clients_deleted_at ON public.clients USING btree (user_id, deleted_at) WHERE (deleted_at IS NOT NULL);

CREATE INDEX idx_clients_user ON public.clients USING btree (user_id);

CREATE INDEX idx_companies_client ON public.companies USING btree (client_id) WHERE (client_id IS NOT NULL);

CREATE INDEX idx_companies_deleted ON public.companies USING btree (user_id, deleted_at) WHERE (deleted_at IS NOT NULL);

CREATE INDEX idx_companies_user ON public.companies USING btree (user_id, created_at DESC);

CREATE INDEX idx_companies_name ON public.companies USING btree (user_id, name);

CREATE INDEX idx_contact_activities_type ON public.contact_activities USING btree (user_id, activity_type);

CREATE INDEX idx_contact_activities_user ON public.contact_activities USING btree (user_id, created_at DESC);

CREATE INDEX idx_contact_activities_contact ON public.contact_activities USING btree (contact_id, created_at DESC);

CREATE INDEX idx_ccampa_campaign ON public.contact_campaign_assoc USING btree (campaign_id);

CREATE INDEX idx_ccampa_contact ON public.contact_campaign_assoc USING btree (contact_id);

CREATE INDEX idx_cca_contact ON public.contact_client_assoc USING btree (contact_id);

CREATE INDEX idx_cca_client ON public.contact_client_assoc USING btree (client_id);

CREATE INDEX idx_docs_user_cat ON public.contact_documents USING btree (user_id, document_category);

CREATE INDEX idx_docs_project ON public.contact_documents USING btree (project_id);

CREATE INDEX idx_docs_client ON public.contact_documents USING btree (client_id);

CREATE INDEX idx_contact_docs_contact ON public.contact_documents USING btree (contact_id);

CREATE INDEX idx_docs_category ON public.contact_documents USING btree (document_category);

CREATE INDEX idx_enrichments_contact ON public.contact_enrichments USING btree (contact_id);

CREATE INDEX idx_field_defs_user ON public.contact_field_definitions USING btree (user_id);

CREATE INDEX idx_field_values_contact ON public.contact_field_values USING btree (contact_id);

CREATE INDEX idx_cpa_contact ON public.contact_project_assoc USING btree (contact_id);

CREATE INDEX idx_cpa_project ON public.contact_project_assoc USING btree (project_id);

CREATE INDEX idx_contact_sequences_next ON public.contact_sequences USING btree (next_step_at) WHERE (status = 'active'::text);

CREATE INDEX idx_contact_sequences_contact ON public.contact_sequences USING btree (contact_id);

CREATE INDEX idx_contact_tag_mappings_contact ON public.contact_tag_mappings USING btree (contact_id);

CREATE INDEX idx_contact_tag_mappings_tag ON public.contact_tag_mappings USING btree (tag_id);

CREATE INDEX idx_contact_tags_user ON public.contact_tags USING btree (user_id);

CREATE INDEX idx_contacts_lead_source_id ON public.contacts USING btree (lead_source_id);

CREATE INDEX idx_contacts_user ON public.contacts USING btree (user_id);

CREATE INDEX idx_contacts_email_norm ON public.contacts USING btree (email_normalized) WHERE (email_normalized IS NOT NULL);

CREATE INDEX idx_contacts_status ON public.contacts USING btree (status);

CREATE INDEX idx_contacts_created ON public.contacts USING btree (created_at);

CREATE INDEX idx_contacts_source ON public.contacts USING btree (lead_source);

CREATE INDEX idx_contacts_last_called ON public.contacts USING btree (last_called_at) WHERE (last_called_at IS NOT NULL);

CREATE INDEX idx_contacts_type ON public.contacts USING btree (contact_type);

CREATE INDEX idx_contacts_email_normalized ON public.contacts USING btree (email_normalized);

CREATE INDEX idx_contacts_phone_normalized ON public.contacts USING btree (phone_normalized);

CREATE INDEX idx_contacts_score ON public.contacts USING btree (contact_score);

CREATE INDEX idx_contacts_utm_source ON public.contacts USING btree (utm_source) WHERE (utm_source IS NOT NULL);

CREATE INDEX idx_contacts_own_pipeline ON public.contacts USING btree (flagged_own_pipeline) WHERE (flagged_own_pipeline = true);

CREATE INDEX idx_contacts_batch ON public.contacts USING btree (import_batch_id);

CREATE INDEX idx_contacts_deleted_at ON public.contacts USING btree (user_id, deleted_at) WHERE (deleted_at IS NOT NULL);

CREATE INDEX idx_contacts_utm_campaign ON public.contacts USING btree (utm_campaign) WHERE (utm_campaign IS NOT NULL);

CREATE INDEX idx_contacts_company ON public.contacts USING btree (company) WHERE (company IS NOT NULL);

CREATE INDEX idx_deals_user ON public.deals USING btree (user_id);

CREATE INDEX idx_deals_deleted_at ON public.deals USING btree (user_id, deleted_at) WHERE (deleted_at IS NOT NULL);

CREATE INDEX idx_deals_contact ON public.deals USING btree (contact_id);

CREATE INDEX idx_deals_created ON public.deals USING btree (created_at);

CREATE INDEX idx_deals_won_at ON public.deals USING btree (won_at) WHERE (won_at IS NOT NULL);

CREATE INDEX idx_deals_stage ON public.deals USING btree (stage);

CREATE INDEX idx_dialer_activity_user ON public.dialer_activity USING btree (user_id);

CREATE INDEX idx_email_accounts_provider ON public.email_accounts USING btree (user_id, provider) WHERE (provider <> 'smtp'::text);

CREATE INDEX idx_email_accounts_sync ON public.email_accounts USING btree (provider, sync_enabled, last_synced_at) WHERE ((provider = 'gmail'::text) AND (sync_enabled = true));

CREATE INDEX idx_email_accounts_user ON public.email_accounts USING btree (user_id);

CREATE INDEX idx_email_accounts_client ON public.email_accounts USING btree (client_id) WHERE (client_id IS NOT NULL);

CREATE INDEX idx_email_logs_direction ON public.email_logs USING btree (user_id, direction, created_at DESC);

CREATE INDEX idx_email_logs_contact_inbound ON public.email_logs USING btree (contact_id, direction, created_at DESC) WHERE (direction = 'inbound'::text);

CREATE INDEX idx_email_logs_contact ON public.email_logs USING btree (contact_id);

CREATE UNIQUE INDEX idx_email_logs_message_id ON public.email_logs USING btree (message_id) WHERE (message_id IS NOT NULL);

CREATE INDEX idx_email_logs_client ON public.email_logs USING btree (client_id, direction, created_at DESC) WHERE (client_id IS NOT NULL);

CREATE INDEX idx_email_logs_created ON public.email_logs USING btree (created_at);

CREATE INDEX idx_email_logs_unread ON public.email_logs USING btree (user_id, read_at) WHERE ((direction = 'inbound'::text) AND (read_at IS NULL));

CREATE INDEX idx_email_logs_user ON public.email_logs USING btree (user_id);

CREATE INDEX idx_email_logs_thread ON public.email_logs USING btree (thread_id, created_at) WHERE (thread_id IS NOT NULL);

CREATE INDEX idx_email_logs_campaign ON public.email_logs USING btree (campaign_id, created_at DESC) WHERE (campaign_id IS NOT NULL);

CREATE INDEX idx_sequences_user ON public.email_sequences USING btree (user_id);

CREATE INDEX idx_email_threads_user ON public.email_threads USING btree (user_id, last_message_at DESC);

CREATE INDEX idx_email_threads_unread ON public.email_threads USING btree (user_id, unread_count) WHERE (unread_count > 0);

CREATE INDEX idx_reports_user ON public.generated_reports USING btree (user_id);

CREATE INDEX idx_reports_client ON public.generated_reports USING btree (client_id);

CREATE INDEX idx_reports_share_token ON public.generated_reports USING btree (share_token);

CREATE INDEX idx_import_batches_user ON public.import_batches USING btree (user_id);

CREATE INDEX idx_invoices_user ON public.invoices USING btree (user_id);

CREATE INDEX idx_invoices_client ON public.invoices USING btree (client_id) WHERE (client_id IS NOT NULL);

CREATE INDEX idx_routing_rules_user ON public.lead_routing_rules USING btree (user_id, rule_order);

CREATE INDEX idx_routing_rules_source ON public.lead_routing_rules USING btree (lead_source_id, rule_order);

CREATE INDEX idx_lead_sources_user ON public.lead_sources USING btree (user_id);

CREATE INDEX idx_lead_sources_token ON public.lead_sources USING btree (webhook_token);

CREATE INDEX idx_login_activity_login_at ON public.login_activity USING btree (login_at);

CREATE INDEX idx_login_activity_user ON public.login_activity USING btree (user_id);

CREATE INDEX idx_marketing_assets_campaign_platform ON public.marketing_assets USING btree (campaign_id, platform);

CREATE INDEX idx_marketing_assets_uploaded_by ON public.marketing_assets USING btree (uploaded_by);

CREATE INDEX idx_marketing_assets_client_status ON public.marketing_assets USING btree (client_id, status);

CREATE INDEX idx_marketing_assets_parent ON public.marketing_assets USING btree (parent_asset_id) WHERE (parent_asset_id IS NOT NULL);

CREATE INDEX idx_marketing_assets_client ON public.marketing_assets USING btree (client_id);

CREATE INDEX idx_marketing_assets_expires ON public.marketing_assets USING btree (expires_at) WHERE (expires_at IS NOT NULL);

CREATE INDEX idx_marketing_assets_client_latest ON public.marketing_assets USING btree (client_id, is_latest_version) WHERE (is_latest_version = true);

CREATE INDEX idx_marketing_assets_user ON public.marketing_assets USING btree (user_id);

CREATE INDEX idx_messages_channel ON public.messages USING btree (channel_id, created_at DESC);

CREATE INDEX idx_missed_calls_returned ON public.missed_calls USING btree (returned);

CREATE INDEX idx_missed_calls_user ON public.missed_calls USING btree (user_id);

CREATE INDEX idx_outbound_webhooks_user ON public.outbound_webhooks USING btree (user_id);

CREATE INDEX idx_password_vault_user ON public.password_vault USING btree (user_id);

CREATE UNIQUE INDEX payouts_call_member_uniq ON public.payouts USING btree (call_id, team_member_id) WHERE (call_id IS NOT NULL);

CREATE INDEX payouts_owner_idx ON public.payouts USING btree (owner_user_id);

CREATE INDEX payouts_member_idx ON public.payouts USING btree (team_member_id);

CREATE INDEX payouts_call_idx ON public.payouts USING btree (call_id);

CREATE INDEX idx_payroll_entries_status ON public.payroll_entries USING btree (status);

CREATE INDEX idx_payroll_entries_user ON public.payroll_entries USING btree (user_id);

CREATE INDEX idx_payroll_entries_member ON public.payroll_entries USING btree (team_member_id);

CREATE INDEX idx_phone_numbers_user ON public.phone_numbers USING btree (user_id);

CREATE INDEX phone_numbers_assigned_idx ON public.phone_numbers USING btree (assigned_user_id);

CREATE INDEX idx_projects_client ON public.projects USING btree (client_id);

CREATE INDEX idx_projects_deleted_at ON public.projects USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);

CREATE INDEX idx_quotas_user ON public.quotas USING btree (user_id);

CREATE INDEX idx_rep_interview_user ON public.rep_interview_answers USING btree (user_id);

CREATE INDEX idx_rep_profiles_public ON public.rep_profiles USING btree (is_public);

CREATE INDEX idx_rep_profiles_username ON public.rep_profiles USING btree (username);

CREATE INDEX idx_rep_supercut_user ON public.rep_supercut_clips USING btree (user_id);

CREATE INDEX idx_scraped_contacts_user ON public.scraped_contacts USING btree (user_id);

CREATE INDEX idx_scraped_contacts_status ON public.scraped_contacts USING btree (status);

CREATE INDEX idx_objection_logs_script ON public.script_objection_logs USING btree (script_id);

CREATE INDEX idx_objection_logs_call ON public.script_objection_logs USING btree (call_id);

CREATE INDEX idx_script_objections_script ON public.script_objections USING btree (script_id);

CREATE INDEX idx_scripts_client ON public.scripts USING btree (client_id);

CREATE INDEX idx_scripts_user ON public.scripts USING btree (user_id);

CREATE INDEX idx_sms_logs_contact ON public.sms_logs USING btree (contact_id);

CREATE INDEX idx_sms_logs_unread ON public.sms_logs USING btree (user_id, read_at) WHERE ((direction = 'inbound'::text) AND (read_at IS NULL));

CREATE INDEX idx_sms_logs_thread_id ON public.sms_logs USING btree (sms_thread_id, sent_at);

CREATE INDEX idx_sms_logs_thread ON public.sms_logs USING btree (thread_id, sent_at DESC) WHERE (thread_id IS NOT NULL);

CREATE INDEX idx_sms_logs_from_number ON public.sms_logs USING btree (from_number, sent_at DESC);

CREATE INDEX idx_sms_logs_user ON public.sms_logs USING btree (user_id);

CREATE INDEX idx_sms_sent_at ON public.sms_logs USING btree (sent_at);

CREATE INDEX idx_sms_logs_contact_direction ON public.sms_logs USING btree (contact_id, direction, sent_at DESC) WHERE (contact_id IS NOT NULL);

CREATE INDEX idx_sms_threads_contact ON public.sms_threads USING btree (contact_id) WHERE (contact_id IS NOT NULL);

CREATE INDEX idx_sms_threads_unread ON public.sms_threads USING btree (user_id, unread_count) WHERE (unread_count > 0);

CREATE INDEX idx_sms_threads_user ON public.sms_threads USING btree (user_id, last_message_at DESC);

CREATE INDEX idx_snippets_user ON public.snippets USING btree (user_id);

CREATE INDEX idx_social_platform_accounts_user ON public.social_platform_accounts USING btree (user_id);

CREATE INDEX idx_social_posts_user ON public.social_posts USING btree (user_id);

CREATE INDEX idx_social_posts_scheduled ON public.social_posts USING btree (scheduled_at) WHERE (status = 'scheduled'::text);

CREATE INDEX idx_stack_accounts_trial_end ON public.stack_accounts USING btree (trial_end) WHERE (trial_end IS NOT NULL);

CREATE INDEX idx_stack_accounts_billing ON public.stack_accounts USING btree (next_billing_date) WHERE (next_billing_date IS NOT NULL);

CREATE INDEX idx_stack_accounts_status ON public.stack_accounts USING btree (status);

CREATE INDEX idx_stack_accounts_user ON public.stack_accounts USING btree (user_id);

CREATE INDEX idx_tasks_status ON public.tasks USING btree (status);

CREATE INDEX idx_tasks_contact ON public.tasks USING btree (contact_id);

CREATE INDEX idx_tasks_source_id ON public.tasks USING btree (source_id) WHERE (source_id IS NOT NULL);

CREATE INDEX idx_tasks_user ON public.tasks USING btree (user_id);

CREATE INDEX idx_tasks_due_status ON public.tasks USING btree (due_date, status) WHERE (status = 'pending'::text);

CREATE INDEX idx_tasks_due ON public.tasks USING btree (due_date);

CREATE INDEX idx_tmc_client ON public.team_member_clients USING btree (client_id);

CREATE INDEX idx_tmc_team_member ON public.team_member_clients USING btree (team_member_id);

CREATE INDEX idx_team_members_member ON public.team_members USING btree (member_user_id);

CREATE INDEX idx_team_members_owner ON public.team_members USING btree (owner_user_id);

CREATE INDEX idx_team_members_portal ON public.team_members USING btree (member_email) WHERE (portal_access = true);

CREATE INDEX idx_team_members_client ON public.team_members USING btree (client_id) WHERE (client_id IS NOT NULL);

CREATE INDEX idx_tech_stack_user ON public.tech_stack_items USING btree (user_id);

CREATE INDEX idx_tech_stack_active ON public.tech_stack_items USING btree (user_id) WHERE (active = true);

CREATE INDEX idx_templates_type ON public.templates USING btree (type);

CREATE INDEX idx_templates_user ON public.templates USING btree (user_id);

CREATE INDEX idx_time_entries_project ON public.time_entries USING btree (project_id);

CREATE INDEX idx_time_entries_user ON public.time_entries USING btree (user_id);

CREATE INDEX idx_time_entries_user_date ON public.time_entries USING btree (user_id, started_at DESC);

CREATE INDEX idx_time_entries_date ON public.time_entries USING btree (entry_date);

CREATE INDEX idx_time_entries_user_project ON public.time_entries USING btree (user_id, project_id, started_at DESC);

CREATE INDEX idx_user_sessions_user ON public.user_sessions USING btree (user_id);

CREATE INDEX idx_user_settings_user ON public.user_settings USING btree (user_id);

CREATE INDEX idx_voicemail_drops_user ON public.voicemail_drops USING btree (user_id);

CREATE INDEX idx_voicemails_status ON public.voicemails USING btree (status);

CREATE INDEX idx_voicemails_user ON public.voicemails USING btree (user_id);

ALTER TABLE public.ad_campaigns_ext ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.api_key_vault ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.api_usage_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.asset_shares ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.asset_versions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.balance_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.budget_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.call_list_contacts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.call_lists ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.campaign_goals ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.campaign_wins ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.client_knowledge ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.contact_activities ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.contact_campaign_assoc ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.contact_client_assoc ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.contact_documents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.contact_enrichments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.contact_field_definitions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.contact_field_values ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.contact_filters ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.contact_project_assoc ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.contact_sequences ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.contact_tag_mappings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.dialer_activity ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.email_sequences ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.generated_reports ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lead_routing_rules ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lead_sources ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.login_activity ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.marketing_assets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.missed_calls ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.outbound_webhooks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.password_vault ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payroll_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.phone_numbers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.quotas ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.scraped_contacts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.script_objection_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.script_objections ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.scripts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sequence_steps ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.slack_integrations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sms_threads ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.snippets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.social_platform_accounts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.stack_accounts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.team_member_clients ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.teams_integrations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tech_stack_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.voicemail_drops ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.voicemails ENABLE ROW LEVEL SECURITY;

CREATE POLICY ad_campaigns_ext_all ON public.ad_campaigns_ext AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY api_vault_all ON public.api_key_vault AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY api_tokens_all ON public.api_tokens AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY usage_log_all ON public.api_usage_log AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY asset_shares_owner_all ON public.asset_shares AS PERMISSIVE FOR ALL TO public USING ((shared_by = auth.uid())) WITH CHECK ((shared_by = auth.uid()));

CREATE POLICY asset_versions_team_read ON public.asset_versions AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM ((marketing_assets ma
     JOIN team_members tm ON ((tm.owner_user_id = ma.user_id)))
     JOIN team_member_clients tmc ON ((tmc.team_member_id = tm.id)))
  WHERE ((ma.id = asset_versions.asset_id) AND (tmc.client_id = ma.client_id) AND (tm.member_user_id = auth.uid()) AND (tm.status = 'active'::text)))));

CREATE POLICY asset_versions_owner_all ON public.asset_versions AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM marketing_assets ma
  WHERE ((ma.id = asset_versions.asset_id) AND (ma.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM marketing_assets ma
  WHERE ((ma.id = asset_versions.asset_id) AND (ma.user_id = auth.uid())))));

CREATE POLICY automations_all ON public.automation_rules AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY balance_entries_all ON public.balance_entries AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY budget_entries_all ON public.budget_entries AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY call_list_contacts_all ON public.call_list_contacts AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM ((call_lists
     JOIN projects ON ((projects.id = call_lists.project_id)))
     JOIN clients ON ((clients.id = projects.client_id)))
  WHERE ((call_lists.id = call_list_contacts.call_list_id) AND (clients.user_id = auth.uid())))));

CREATE POLICY call_lists_all ON public.call_lists AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (projects
     JOIN clients ON ((clients.id = projects.client_id)))
  WHERE ((projects.id = call_lists.project_id) AND (clients.user_id = auth.uid())))));

CREATE POLICY calls_insert ON public.calls AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));

CREATE POLICY calls_select ON public.calls AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));

CREATE POLICY calls_update ON public.calls AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id));

CREATE POLICY goals_all ON public.campaign_goals AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY "Users manage own campaign wins" ON public.campaign_wins AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY campaigns_all ON public.campaigns AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (projects
     JOIN clients ON ((clients.id = projects.client_id)))
  WHERE ((projects.id = campaigns.project_id) AND (clients.user_id = auth.uid())))));

CREATE POLICY knowledge_all ON public.client_knowledge AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY clients_insert ON public.clients AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));

CREATE POLICY clients_delete ON public.clients AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));

CREATE POLICY clients_update ON public.clients AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id));

CREATE POLICY clients_select ON public.clients AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));

CREATE POLICY companies_owner ON public.companies AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY activities_owner ON public.contact_activities AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY ccampa_all ON public.contact_campaign_assoc AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY cca_all ON public.contact_client_assoc AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY docs_all ON public.contact_documents AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY enrichments_all ON public.contact_enrichments AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY field_defs_all ON public.contact_field_definitions AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY field_values_all ON public.contact_field_values AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM contacts
  WHERE ((contacts.id = contact_field_values.contact_id) AND (contacts.user_id = auth.uid())))));

CREATE POLICY filters_all ON public.contact_filters AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY cpa_all ON public.contact_project_assoc AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY contact_seqs_all ON public.contact_sequences AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM contacts
  WHERE ((contacts.id = contact_sequences.contact_id) AND (contacts.user_id = auth.uid())))));

CREATE POLICY tag_mappings_all ON public.contact_tag_mappings AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM contacts
  WHERE ((contacts.id = contact_tag_mappings.contact_id) AND (contacts.user_id = auth.uid())))));

CREATE POLICY tags_all ON public.contact_tags AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY contacts_select ON public.contacts AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));

CREATE POLICY contacts_delete ON public.contacts AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));

CREATE POLICY contacts_insert ON public.contacts AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));

CREATE POLICY contacts_update ON public.contacts AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id));

CREATE POLICY deals_all ON public.deals AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY activity_all ON public.dialer_activity AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY email_accounts_owner ON public.email_accounts AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY email_logs_all ON public.email_logs AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY sequences_all ON public.email_sequences AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY "Users manage own email threads" ON public.email_threads AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY reports_all ON public.generated_reports AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY batches_all ON public.import_batches AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY invoices_all ON public.invoices AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY "Users manage own routing rules" ON public.lead_routing_rules AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY lead_sources_all ON public.lead_sources AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY login_activity_all ON public.login_activity AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY marketing_assets_all ON public.marketing_assets AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY missed_calls_all ON public.missed_calls AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY webhooks_all ON public.outbound_webhooks AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY pwd_vault_all ON public.password_vault AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY payroll_entries_all ON public.payroll_entries AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY phone_numbers_all ON public.phone_numbers AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY profiles_select_own ON public.profiles AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = id));

CREATE POLICY projects_all ON public.projects AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM clients
  WHERE ((clients.id = projects.client_id) AND (clients.user_id = auth.uid())))));

CREATE POLICY quotas_all ON public.quotas AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY scraped_all ON public.scraped_contacts AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY obj_logs_all ON public.script_objection_logs AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM calls
  WHERE ((calls.id = script_objection_logs.call_id) AND (calls.user_id = auth.uid())))));

CREATE POLICY objections_all ON public.script_objections AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM scripts
  WHERE ((scripts.id = script_objections.script_id) AND (scripts.user_id = auth.uid())))));

CREATE POLICY scripts_all ON public.scripts AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY seq_steps_all ON public.sequence_steps AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM email_sequences
  WHERE ((email_sequences.id = sequence_steps.sequence_id) AND (email_sequences.user_id = auth.uid())))));

CREATE POLICY slack_integrations_all ON public.slack_integrations AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY sms_logs_all ON public.sms_logs AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY "Users manage own SMS threads" ON public.sms_threads AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY snippets_all ON public.snippets AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY social_accounts_all ON public.social_platform_accounts AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY social_posts_all ON public.social_posts AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY stack_accounts_all ON public.stack_accounts AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY tasks_all ON public.tasks AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY tmc_member_read_own ON public.team_member_clients AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM team_members tm
  WHERE ((tm.id = team_member_clients.team_member_id) AND (tm.member_user_id = auth.uid())))));

CREATE POLICY tmc_owner_all ON public.team_member_clients AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM team_members tm
  WHERE ((tm.id = team_member_clients.team_member_id) AND (tm.owner_user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM team_members tm
  WHERE ((tm.id = team_member_clients.team_member_id) AND (tm.owner_user_id = auth.uid())))));

CREATE POLICY team_member_read ON public.team_members AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = member_user_id));

CREATE POLICY team_owner ON public.team_members AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = owner_user_id));

CREATE POLICY teams_integrations_all ON public.teams_integrations AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY tech_stack_all ON public.tech_stack_items AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY templates_all ON public.templates AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY time_entries_owner ON public.time_entries AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY time_entries_all ON public.time_entries AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY prefs_all ON public.user_preferences AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY sessions_all ON public.user_sessions AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY user_settings_all ON public.user_settings AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY vm_drops_all ON public.voicemail_drops AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE POLICY voicemails_all ON public.voicemails AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id));

CREATE OR REPLACE FUNCTION public.user_can_access_client_assets(p_client_id uuid, p_min_access text DEFAULT 'read'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_access_levels TEXT[]  := ARRAY['read', 'write', 'manage'];
    v_min_idx       INTEGER;
    v_user_level    TEXT;
BEGIN
    -- Workspace owners always have full access to their own clients.
    IF EXISTS (
        SELECT 1 FROM clients
        WHERE id = p_client_id AND user_id = auth.uid()
    ) THEN
        RETURN TRUE;
    END IF;
 
    -- Look up the highest access level this user holds for the client
    -- via the team_member_clients junction table.
    SELECT tmc.access_level
    INTO   v_user_level
    FROM   team_members        tm
    JOIN   team_member_clients tmc ON tmc.team_member_id = tm.id
    WHERE  tm.member_user_id = auth.uid()
      AND  tmc.client_id     = p_client_id
      AND  tm.status         = 'active'
    ORDER BY array_position(v_access_levels, tmc.access_level) DESC
    LIMIT  1;
 
    -- No assignment found â†’ deny
    IF v_user_level IS NULL THEN
        RETURN FALSE;
    END IF;
 
    -- Validate p_min_access; treat unknown level as most restrictive
    v_min_idx := array_position(v_access_levels, p_min_access);
    IF v_min_idx IS NULL THEN
        RETURN FALSE;
    END IF;
 
    RETURN array_position(v_access_levels, v_user_level) >= v_min_idx;
END;
$function$
;