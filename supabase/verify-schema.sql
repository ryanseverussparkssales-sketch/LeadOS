-- ============================================================================
-- App-critical schema verification.
-- Run in the Supabase SQL editor against PROD (should be all-present since every
-- migration has been applied) and against any rebuilt SHADOW DB after a
-- `supabase db reset`. Each query should return ZERO rows.
-- These are the tables/columns the application actually reads/writes — the same
-- set whose absence in COMPLETE-SCHEMA.sql the audit flagged.
-- Read-only: selects from information_schema only. Safe on prod.
-- ============================================================================

-- 1) Required TABLES that are missing -----------------------------------------
WITH expected_tables(table_name) AS (VALUES
  ('contacts'),('calls'),('call_lists'),('call_list_contacts'),('campaign_contacts'),
  ('campaigns'),('projects'),('clients'),('scraped_contacts'),('contact_enrichments'),
  ('contact_client_assoc'),('team_members'),('payouts'),('call_feedback'),('deals'),
  ('tasks'),('sms_threads'),('sms_logs'),('email_threads'),('email_logs'),
  ('phone_numbers'),('voicemail_drops'),('time_entries'),('invoices'),('scripts'),
  ('script_objections'),('api_usage_log'),('contact_field_definitions'),
  ('contact_field_values'),('contact_tag_mappings')
)
SELECT 'MISSING TABLE' AS issue, e.table_name
FROM expected_tables e
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'public' AND t.table_name = e.table_name
WHERE t.table_name IS NULL
ORDER BY e.table_name;

-- 2) Required COLUMNS that are missing ----------------------------------------
WITH expected(table_name, column_name) AS (VALUES
  -- contacts (utm + soft-delete + test-gating + dialer fields)
  ('contacts','is_test'),('contacts','deleted_at'),
  ('contacts','utm_source'),('contacts','utm_medium'),('contacts','utm_campaign'),
  ('contacts','utm_content'),('contacts','utm_term'),
  ('contacts','phone_normalized'),('contacts','email_normalized'),
  ('contacts','contact_score'),('contacts','contact_type'),('contacts','lead_source'),
  ('contacts','is_business'),('contacts','call_count'),('contacts','last_called_at'),
  -- calls
  ('calls','campaign_id'),('calls','call_list_id'),('calls','twilio_call_sid'),
  ('calls','outcome'),('calls','quality_score'),('calls','quality_breakdown'),
  ('calls','recording_url'),('calls','recording_sid'),('calls','call_duration_seconds'),
  ('calls','ended_at'),('calls','processed_at'),('calls','raw_transcript'),('calls','summary'),
  -- call lists / queue
  ('call_lists','campaign_id'),('call_lists','project_id'),('call_lists','status'),
  ('call_list_contacts','call_list_id'),('call_list_contacts','contact_id'),
  ('call_list_contacts','queue_position'),('call_list_contacts','status'),
  ('call_list_contacts','last_called_at'),
  -- scraper upgrade columns
  ('scraped_contacts','source_query'),('scraped_contacts','campaign_id'),
  ('scraped_contacts','call_list_id'),('scraped_contacts','notes'),
  -- team / stripe connect (payouts depend on these)
  ('team_members','member_user_id'),('team_members','owner_user_id'),
  ('team_members','role'),('team_members','status'),
  ('team_members','stripe_connect_account_id'),('team_members','stripe_connect_status'),
  -- campaigns (win tracking)
  ('campaigns','project_id'),('campaigns','win_count'),('campaigns','calls_today'),
  ('campaigns','total_calls'),('campaigns','win_conditions'),('campaigns','custom_outcomes'),
  ('campaigns','daily_call_goal'),('campaigns','target_wins'),('campaigns','win_label'),
  ('campaigns','win_outcome'),('campaigns','is_test'),('campaigns','deleted_at'),
  -- payouts
  ('payouts','owner_user_id'),('payouts','team_member_id'),('payouts','call_id'),
  ('payouts','amount_cents'),('payouts','status'),('payouts','stripe_transfer_id'),
  ('payouts','paid_at'),
  -- scripts / objections (IDOR fix joins on these)
  ('scripts','user_id'),('script_objections','script_id'),('script_objections','sort_order'),
  -- inbound email logging (Wave 1 fix writes these)
  ('email_logs','from_address'),('email_logs','to_address'),('email_logs','direction')
)
SELECT 'MISSING COLUMN' AS issue, e.table_name, e.column_name
FROM expected e
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
 AND c.table_name = e.table_name
 AND c.column_name = e.column_name
WHERE c.column_name IS NULL
ORDER BY e.table_name, e.column_name;

-- 3) RPC functions the app calls ----------------------------------------------
WITH expected_fns(fn) AS (VALUES
  ('increment_rate_limit'),('cleanup_rate_limits'),('increment_campaign_win_count')
)
SELECT 'MISSING FUNCTION' AS issue, e.fn
FROM expected_fns e
LEFT JOIN information_schema.routines r
  ON r.routine_schema = 'public' AND r.routine_name = e.fn
WHERE r.routine_name IS NULL
ORDER BY e.fn;
