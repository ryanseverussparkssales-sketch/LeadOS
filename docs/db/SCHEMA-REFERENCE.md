# LeadOS Database Schema Reference

_Generated from the live production schema (Supabase project `legzdsbemjowgddwavbi`) on 2026-06-09._

This is the **authoritative list of what columns exist**. Code must match this. 
Every schema-drift bug to date came from code referencing columns absent here. 
When you add a column, add a numbered migration in `supabase/migrations/` AND it shows up here on the next regeneration.

**93 tables.** Regenerate with the catalog query in `supabase/migrations/README.md`.

## `ad_campaigns_ext`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| ad_account_id | text | yes |
| budget | numeric | yes |
| budget_period | text | yes |
| campaign_type | text | yes |
| clicks | integer | yes |
| client_id | uuid | yes |
| conversions | integer | yes |
| cpc | numeric | yes |
| cpl | numeric | yes |
| created_at | timestamp without time zone | yes |
| ctr | numeric | yes |
| end_date | date | yes |
| external_campaign_id | text | yes |
| impressions | integer | yes |
| lead_campaign_id | uuid | yes |
| leads | integer | yes |
| name | text | **NO** |
| notes | text | yes |
| platform | text | **NO** |
| roas | numeric | yes |
| spent | numeric | yes |
| start_date | date | yes |
| status | text | yes |
| updated_at | timestamp without time zone | yes |

## `api_key_vault`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| created_at | timestamp without time zone | yes |
| environment | text | yes |
| key_value | text | **NO** |
| name | text | **NO** |
| notes | text | yes |
| service | text | yes |

## `api_tokens`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| created_at | timestamp without time zone | yes |
| expires_at | timestamp without time zone | yes |
| last_used_at | timestamp without time zone | yes |
| name | text | **NO** |
| scopes | ARRAY | yes |
| token_hash | text | **NO** |

## `api_usage_log`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| call_id | uuid | **NO** |
| claude_cost | numeric | yes |
| claude_input_tokens | integer | yes |
| claude_output_tokens | integer | yes |
| created_at | timestamp without time zone | yes |
| groq_cost | numeric | yes |
| total_cost | numeric | yes |
| twilio_cost | numeric | yes |
| twilio_duration_minutes | integer | yes |

## `appointment_templates`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| owner_user_id | uuid | **NO** |
| campaign_id | uuid | yes |
| created_at | timestamp with time zone | yes |
| default_format | text | yes |
| duration_minutes | integer | yes |
| name | text | **NO** |
| questions | jsonb | **NO** |

## `appointments`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| owner_user_id | uuid | **NO** |
| call_id | uuid | yes |
| campaign_id | uuid | yes |
| contact_id | uuid | **NO** |
| created_at | timestamp with time zone | yes |
| duration_minutes | integer | yes |
| format | text | yes |
| location | text | yes |
| meeting_link | text | yes |
| notes | text | yes |
| qualifying_answers | jsonb | yes |
| scheduled_at | timestamp with time zone | yes |
| status | text | yes |

## `asset_shares`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| access_count | integer | yes |
| accessed_at | timestamp with time zone | yes |
| asset_id | uuid | **NO** |
| created_at | timestamp with time zone | yes |
| expires_at | timestamp with time zone | **NO** |
| is_revoked | boolean | yes |
| recipient_email | text | yes |
| share_token | text | **NO** |
| shared_by | uuid | **NO** |

## `asset_versions`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| asset_id | uuid | **NO** |
| created_at | timestamp with time zone | yes |
| file_size | bigint | yes |
| mime_type | text | yes |
| storage_bucket | text | **NO** |
| storage_path | text | **NO** |
| upload_note | text | yes |
| uploaded_by | uuid | yes |
| version | integer | **NO** |

## `automation_rules`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| actions | jsonb | yes |
| conditions | jsonb | yes |
| created_at | timestamp without time zone | yes |
| enabled | boolean | yes |
| last_run_at | timestamp without time zone | yes |
| name | text | **NO** |
| run_count | integer | yes |
| trigger_type | text | **NO** |

## `balance_entries`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| created_at | timestamp without time zone | yes |
| entry_date | date | **NO** |
| expenses | numeric | yes |
| income | numeric | yes |
| notes | text | yes |

## `budget_entries`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| amount | numeric | **NO** |
| category | text | **NO** |
| created_at | timestamp without time zone | yes |
| entry_date | date | yes |
| entry_type | text | **NO** |
| frequency | text | yes |
| label | text | **NO** |
| notes | text | yes |

## `call_feedback`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| call_id | uuid | **NO** |
| content | text | **NO** |
| created_at | timestamp with time zone | **NO** |
| rating | integer | yes |
| reviewer_user_id | uuid | **NO** |
| timestamp_seconds | integer | yes |

## `call_list_contacts`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| added_at | timestamp without time zone | yes |
| attempt_count | integer | yes |
| cadence_complete | boolean | yes |
| call_list_id | uuid | **NO** |
| contact_id | uuid | **NO** |
| last_called_at | timestamp with time zone | yes |
| next_follow_up_at | timestamp with time zone | yes |
| queue_position | integer | yes |
| skip_count | integer | yes |
| skip_limit | integer | yes |
| status | text | yes |

## `call_lists`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| campaign_id | uuid | yes |
| created_at | timestamp without time zone | yes |
| deleted_at | timestamp with time zone | yes |
| name | text | **NO** |
| project_id | uuid | **NO** |
| status | text | yes |

## `calls`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| call_duration_seconds | integer | yes |
| call_list_id | uuid | yes |
| call_type | text | yes |
| contact_id | uuid | yes |
| created_at | timestamp without time zone | yes |
| direction | text | yes |
| ended_at | timestamp without time zone | yes |
| from_number | text | yes |
| notes | text | yes |
| outcome | text | yes |
| phone_number | text | yes |
| phone_number_id | uuid | yes |
| quality_breakdown | text | yes |
| quality_score | integer | yes |
| raw_transcript | text | yes |
| recording_url | text | yes |
| script_id | uuid | yes |
| started_at | timestamp without time zone | yes |
| status | text | yes |
| summary | text | yes |
| to_number | text | yes |
| twilio_call_sid | text | yes |

## `campaign_contacts`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| campaign_id | uuid | **NO** |
| contact_id | uuid | **NO** |
| created_at | timestamp without time zone | yes |
| last_called_at | timestamp with time zone | yes |

## `campaign_goals`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| campaign_id | uuid | **NO** |
| current_value | numeric | yes |
| goal_type | text | **NO** |
| last_reset | date | yes |
| period | text | yes |
| target_value | numeric | **NO** |

## `campaign_sdrs`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| owner_user_id | uuid | **NO** |
| campaign_id | uuid | **NO** |
| created_at | timestamp with time zone | yes |
| sdr_id | uuid | **NO** |

## `campaign_wins`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| call_id | uuid | yes |
| campaign_id | uuid | **NO** |
| contact_id | uuid | **NO** |
| created_at | timestamp with time zone | yes |
| outcome | text | **NO** |
| weight | integer | **NO** |

## `campaigns`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| cadence_days | integer | yes |
| calls_per_lead | integer | yes |
| calls_today | integer | yes |
| campaign_type | text | yes |
| created_at | timestamp without time zone | yes |
| custom_outcomes | jsonb | yes |
| daily_call_goal | integer | yes |
| deleted_at | timestamp with time zone | yes |
| description | text | yes |
| email_sequence_id | uuid | yes |
| followup_count | integer | yes |
| from_email_account_id | uuid | yes |
| from_phone_number_id | uuid | yes |
| goal | text | yes |
| last_reset_date | date | yes |
| name | text | **NO** |
| project_id | uuid | **NO** |
| status | text | yes |
| target_contacts | integer | yes |
| target_wins | integer | yes |
| total_calls | integer | yes |
| win_conditions | jsonb | yes |
| win_count | integer | yes |
| win_label | text | yes |
| win_outcome | text | yes |

## `channel_participants`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| channel_id | uuid | **NO** |
| last_read_at | timestamp with time zone | yes |
| participant_role | text | **NO** |

## `client_docs`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| owner_user_id | uuid | **NO** |
| client_id | uuid | **NO** |
| created_at | timestamp with time zone | yes |
| description | text | yes |
| doc_type | text | yes |
| file_size | integer | yes |
| from_client | boolean | yes |
| is_visible_to_client | boolean | yes |
| submitted_by_name | text | yes |
| title | text | **NO** |
| url | text | **NO** |

## `client_knowledge`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| client_id | uuid | **NO** |
| content | text | **NO** |
| created_at | timestamp without time zone | yes |
| knowledge_type | text | yes |
| sort_order | integer | yes |
| title | text | **NO** |

## `clients`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| created_at | timestamp without time zone | yes |
| deleted_at | timestamp with time zone | yes |
| name | text | **NO** |

## `companies`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| address | text | yes |
| city | text | yes |
| client_id | uuid | yes |
| company_type | text | yes |
| created_at | timestamp with time zone | yes |
| deleted_at | timestamp with time zone | yes |
| description | text | yes |
| email | text | yes |
| industry | text | yes |
| linkedin_url | text | yes |
| name | text | **NO** |
| notes | text | yes |
| phone | text | yes |
| phone_normalized | text | yes |
| size | text | yes |
| state | text | yes |
| tags | ARRAY | yes |
| updated_at | timestamp with time zone | yes |
| website | text | yes |

## `contact_activities`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| activity_type | text | **NO** |
| contact_id | uuid | **NO** |
| created_at | timestamp with time zone | **NO** |
| description | text | yes |
| duration_minutes | integer | yes |
| outcome | text | yes |
| scheduled_at | timestamp with time zone | yes |
| title | text | yes |
| updated_at | timestamp with time zone | yes |

## `contact_campaign_assoc`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| campaign_id | uuid | **NO** |
| contact_id | uuid | **NO** |
| created_at | timestamp without time zone | yes |

## `contact_client_assoc`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| client_id | uuid | **NO** |
| contact_id | uuid | **NO** |
| created_at | timestamp without time zone | yes |

## `contact_documents`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| bucket_name | text | yes |
| client_id | uuid | yes |
| contact_id | uuid | yes |
| created_at | timestamp without time zone | yes |
| deal_id | uuid | yes |
| document_category | text | yes |
| file_size | integer | yes |
| file_type | text | yes |
| file_url | text | **NO** |
| name | text | **NO** |
| project_id | uuid | yes |
| storage_path | text | yes |
| tags | ARRAY | yes |

## `contact_enrichments`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| company_summary | text | yes |
| contact_id | uuid | **NO** |
| enriched_at | timestamp without time zone | yes |
| outreach_angle | text | yes |
| personalized_message | text | yes |
| talking_points | text | yes |

## `contact_field_definitions`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| created_at | timestamp without time zone | yes |
| field_key | text | **NO** |
| field_type | text | yes |
| name | text | **NO** |
| options | jsonb | yes |
| sort_order | integer | yes |

## `contact_field_values`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| contact_id | uuid | **NO** |
| field_definition_id | uuid | **NO** |
| updated_at | timestamp without time zone | yes |
| value | text | yes |

## `contact_filters`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| created_at | timestamp without time zone | yes |
| filter_config | jsonb | yes |
| name | text | **NO** |

## `contact_inquiries`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| budget | text | yes |
| company | text | yes |
| created_at | timestamp with time zone | yes |
| email | text | **NO** |
| message | text | yes |
| name | text | **NO** |
| source | text | yes |
| vertical | text | yes |

## `contact_project_assoc`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| contact_id | uuid | **NO** |
| created_at | timestamp without time zone | yes |
| project_id | uuid | **NO** |

## `contact_sequences`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| campaign_id | uuid | yes |
| contact_id | uuid | **NO** |
| current_step | integer | yes |
| next_step_at | timestamp without time zone | yes |
| sequence_id | uuid | **NO** |
| started_at | timestamp without time zone | yes |
| status | text | yes |

## `contact_tag_mappings`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| added_at | timestamp without time zone | yes |
| contact_id | uuid | **NO** |
| tag_id | uuid | **NO** |

## `contact_tags`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| color | text | yes |
| created_at | timestamp without time zone | yes |
| name | text | **NO** |

## `contacts`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| call_count | integer | yes |
| company | text | yes |
| company_id | uuid | yes |
| contact_score | integer | yes |
| contact_type | text | yes |
| created_at | timestamp without time zone | yes |
| customer_since | date | yes |
| deleted_at | timestamp with time zone | yes |
| do_not_email | boolean | yes |
| email | text | yes |
| email_normalized | text | yes |
| flagged_own_pipeline | boolean | yes |
| import_batch_id | uuid | yes |
| is_business | boolean | yes |
| last_called_at | timestamp without time zone | yes |
| lead_metadata | jsonb | yes |
| lead_source | text | yes |
| lead_source_id | uuid | yes |
| linkedin_url | text | yes |
| name | text | **NO** |
| notes | text | yes |
| own_pipeline_flagged_at | timestamp without time zone | yes |
| own_pipeline_notes | text | yes |
| own_pipeline_product | text | yes |
| phone | text | yes |
| phone_normalized | text | yes |
| score_updated_at | timestamp without time zone | yes |
| status | text | yes |
| title | text | yes |
| updated_at | timestamp without time zone | yes |
| utm_campaign | text | yes |
| utm_content | text | yes |
| utm_medium | text | yes |
| utm_source | text | yes |
| utm_term | text | yes |
| website | text | yes |

## `cron_logs`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| created_at | timestamp with time zone | yes |
| details | jsonb | yes |
| job_name | text | **NO** |
| last_result | text | yes |
| last_run | timestamp with time zone | yes |

## `deals`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| campaign_id | uuid | yes |
| client_id | uuid | yes |
| contact_id | uuid | yes |
| created_at | timestamp without time zone | yes |
| deleted_at | timestamp with time zone | yes |
| expected_close | date | yes |
| lost_at | timestamp without time zone | yes |
| lost_reason | text | yes |
| notes | text | yes |
| probability | integer | yes |
| stage | text | **NO** |
| title | text | **NO** |
| updated_at | timestamp without time zone | yes |
| value | numeric | yes |
| won_at | timestamp without time zone | yes |

## `dialer_activity`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| activity_end | timestamp without time zone | yes |
| activity_start | timestamp without time zone | yes |
| activity_type | text | yes |
| call_id | uuid | yes |
| campaign_id | uuid | yes |
| created_at | timestamp without time zone | yes |
| duration_seconds | integer | yes |
| project_id | uuid | yes |
| session_id | uuid | yes |

## `email_accounts`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| client_id | uuid | yes |
| created_at | timestamp with time zone | yes |
| email | text | yes |
| email_address | text | **NO** |
| gmail_history_id | text | yes |
| google_account_id | text | yes |
| inbound_address | text | yes |
| is_default | boolean | yes |
| label | text | **NO** |
| last_synced_at | timestamp with time zone | yes |
| oauth_access_token | text | yes |
| oauth_refresh_token | text | yes |
| oauth_scopes | ARRAY | yes |
| oauth_token_expires_at | timestamp with time zone | yes |
| provider | text | yes |
| smtp_host | text | yes |
| smtp_password_encrypted | text | yes |
| smtp_port | integer | yes |
| smtp_user | text | yes |
| sync_enabled | boolean | yes |

## `email_logs`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| attachments | jsonb | yes |
| body | text | **NO** |
| call_id | uuid | yes |
| campaign_id | uuid | yes |
| client_id | uuid | yes |
| contact_id | uuid | yes |
| created_at | timestamp without time zone | yes |
| direction | text | yes |
| email_thread_id | uuid | yes |
| email_type | text | yes |
| from_address | text | yes |
| generated_by | text | yes |
| html_body | text | yes |
| in_reply_to | text | yes |
| intent_label | text | yes |
| intent_score | numeric | yes |
| message_id | text | yes |
| project_id | uuid | yes |
| read_at | timestamp with time zone | yes |
| reply_tag | text | yes |
| reply_to | text | yes |
| resend_email_id | text | yes |
| sent_at | timestamp without time zone | yes |
| spam_score | numeric | yes |
| status | text | yes |
| subject | text | yes |
| task_id | uuid | yes |
| thread_id | text | yes |
| to_address | text | yes |

## `email_sequences`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| created_at | timestamp without time zone | yes |
| description | text | yes |
| name | text | **NO** |
| status | text | yes |
| trigger_type | text | yes |

## `email_threads`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| contact_id | uuid | yes |
| created_at | timestamp with time zone | yes |
| last_message_at | timestamp with time zone | yes |
| last_message_body | text | yes |
| last_message_direction | text | yes |
| message_count | integer | yes |
| participants | ARRAY | yes |
| subject | text | **NO** |
| thread_key | text | **NO** |
| unread_count | integer | yes |

## `engagements`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| owner_user_id | uuid | **NO** |
| active | boolean | yes |
| base_fee | integer | **NO** |
| billing_day | integer | yes |
| bonus_rate | integer | **NO** |
| client_id | uuid | **NO** |
| created_at | timestamp with time zone | yes |
| notes | text | yes |
| sdr_user_id | uuid | yes |

## `generated_reports`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| campaign_id | uuid | yes |
| client_id | uuid | yes |
| content | text | yes |
| created_at | timestamp without time zone | yes |
| date_from | date | yes |
| date_to | date | yes |
| html_content | text | yes |
| project_id | uuid | yes |
| report_title | text | **NO** |
| report_type | text | **NO** |
| share_expires_at | timestamp without time zone | yes |
| share_token | text | yes |
| status | text | yes |

## `import_batches`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| can_undo | boolean | yes |
| created_at | timestamp without time zone | yes |
| filename | text | yes |
| mode | text | yes |
| source | text | yes |
| total_created | integer | yes |
| total_skipped | integer | yes |
| total_updated | integer | yes |

## `invoices`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| account_number | text | yes |
| account_type | text | yes |
| bank_name | text | yes |
| client_id | uuid | yes |
| contract_end | date | yes |
| contract_start | date | yes |
| contract_type | text | yes |
| created_at | timestamp without time zone | yes |
| due_date | date | yes |
| expected_hours_monthly | numeric | yes |
| expected_hours_weekly | numeric | yes |
| hourly_rate | numeric | yes |
| hours_worked | numeric | yes |
| invoice_date | date | yes |
| invoice_number | text | yes |
| paid_at | timestamp without time zone | yes |
| payment_memo | text | yes |
| payment_method | text | yes |
| payment_notes | text | yes |
| project_ids | ARRAY | yes |
| report_id | uuid | yes |
| routing_number | text | yes |
| scope_of_work | text | yes |
| status | text | yes |
| subtotal | numeric | yes |
| tax_amount | numeric | yes |
| tax_percent | numeric | yes |
| total | numeric | yes |

## `lead_routing_rules`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| action_type | text | **NO** |
| action_value | text | yes |
| condition_field | text | **NO** |
| condition_operator | text | **NO** |
| condition_value | text | yes |
| created_at | timestamp with time zone | yes |
| is_active | boolean | yes |
| lead_source_id | uuid | yes |
| name | text | yes |
| rule_order | integer | **NO** |
| stop_on_match | boolean | yes |

## `lead_sources`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| auto_call_list_id | uuid | yes |
| campaign_id | uuid | yes |
| client_id | uuid | yes |
| created_at | timestamp without time zone | yes |
| default_contact_type | text | yes |
| description | text | yes |
| last_lead_at | timestamp with time zone | yes |
| lead_count | integer | yes |
| leads_this_week | integer | yes |
| leads_today | integer | yes |
| metadata_schema | jsonb | yes |
| name | text | **NO** |
| project_id | uuid | yes |
| source_type | text | yes |
| status | text | yes |
| updated_at | timestamp with time zone | yes |
| webhook_token | text | **NO** |

## `login_activity`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| device_name | text | yes |
| ip_address | text | yes |
| login_at | timestamp without time zone | yes |
| status | text | yes |
| user_agent | text | yes |

## `marketing_assets`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| approved_at | timestamp with time zone | yes |
| approved_by | uuid | yes |
| asset_type | text | yes |
| campaign_id | uuid | yes |
| canva_design_id | text | yes |
| canva_edit_url | text | yes |
| client_id | uuid | yes |
| created_at | timestamp without time zone | yes |
| expires_at | timestamp with time zone | yes |
| file_size | bigint | yes |
| file_url | text | yes |
| format | text | yes |
| height | integer | yes |
| is_latest_version | boolean | yes |
| mime_type | text | yes |
| name | text | **NO** |
| notes | text | yes |
| original_filename | text | yes |
| parent_asset_id | uuid | yes |
| platform | text | yes |
| prompt | text | yes |
| source | text | yes |
| status | text | yes |
| storage_bucket | text | yes |
| storage_path | text | yes |
| tags | ARRAY | yes |
| thumbnail_url | text | yes |
| uploaded_by | uuid | yes |
| version | integer | yes |
| width | integer | yes |

## `message_channels`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| owner_user_id | uuid | **NO** |
| campaign_id | uuid | yes |
| channel_type | text | **NO** |
| client_id | uuid | yes |
| created_at | timestamp with time zone | yes |
| name | text | **NO** |

## `messages`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| channel_id | uuid | **NO** |
| content | text | **NO** |
| created_at | timestamp with time zone | yes |
| sender_id | uuid | **NO** |
| sender_name | text | yes |
| sender_role | text | **NO** |

## `missed_calls`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| call_duration_seconds | integer | yes |
| caller_id | text | **NO** |
| caller_name | text | yes |
| notes | text | yes |
| phone_number_id | uuid | yes |
| received_at | timestamp without time zone | yes |
| returned | boolean | yes |
| returned_at | timestamp without time zone | yes |

## `outbound_webhooks`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| created_at | timestamp without time zone | yes |
| delivery_count | integer | yes |
| enabled | boolean | yes |
| events | ARRAY | yes |
| last_delivered_at | timestamp without time zone | yes |
| name | text | **NO** |
| secret | text | yes |
| url | text | **NO** |

## `password_vault`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| category | text | yes |
| created_at | timestamp without time zone | yes |
| notes | text | yes |
| password_encrypted | text | **NO** |
| site_name | text | **NO** |
| site_url | text | yes |
| updated_at | timestamp without time zone | yes |
| username | text | yes |

## `payouts`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| owner_user_id | uuid | **NO** |
| amount_cents | integer | **NO** |
| call_id | uuid | yes |
| created_at | timestamp with time zone | **NO** |
| currency | text | **NO** |
| notes | text | yes |
| paid_at | timestamp with time zone | yes |
| status | text | **NO** |
| stripe_transfer_id | text | yes |
| team_member_id | uuid | yes |

## `payroll_entries`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| base_pay | numeric | yes |
| bonuses | numeric | yes |
| commission | numeric | yes |
| created_at | timestamp without time zone | yes |
| deductions | numeric | yes |
| member_email | text | yes |
| net_pay | numeric | yes |
| notes | text | yes |
| paid_at | timestamp without time zone | yes |
| pay_period_end | date | **NO** |
| pay_period_start | date | **NO** |
| payment_method | text | yes |
| reference | text | yes |
| status | text | yes |
| team_member_id | uuid | yes |

## `phone_numbers`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| assigned_user_id | uuid | yes |
| campaign_id | uuid | yes |
| client_id | uuid | yes |
| created_at | timestamp without time zone | yes |
| forwarding_enabled | boolean | yes |
| forwarding_number | text | yes |
| friendly_name | text | yes |
| is_primary | boolean | yes |
| phone_number | text | **NO** |
| record_incoming | boolean | yes |
| ring_timeout_seconds | integer | yes |
| status | text | yes |
| twilio_phone_sid | text | yes |
| voicemail_enabled | boolean | yes |
| voicemail_greeting | text | yes |

## `platform_admins`

| column | type | nullable |
|---|---|---|
| user_id | uuid | **NO** |
| created_at | timestamp with time zone | **NO** |

## `projects`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| client_id | uuid | **NO** |
| created_at | timestamp without time zone | yes |
| deleted_at | timestamp with time zone | yes |
| from_email_account_id | uuid | yes |
| from_phone_number_id | uuid | yes |
| name | text | **NO** |

## `quotas`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| created_at | timestamp without time zone | yes |
| period | text | **NO** |
| period_end | date | **NO** |
| period_start | date | **NO** |
| quota_type | text | **NO** |
| target_value | numeric | **NO** |

## `rep_interview_answers`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| created_at | timestamp with time zone | yes |
| feedback | text | yes |
| question_index | integer | **NO** |
| question_text | text | **NO** |
| recording_url | text | yes |
| score | integer | yes |
| transcript | text | yes |

## `rep_profiles`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| availability | text | yes |
| bio | text | yes |
| certifications | ARRAY | yes |
| created_at | timestamp with time zone | yes |
| display_name | text | yes |
| hourly_rate | integer | yes |
| interview_completed_at | timestamp with time zone | yes |
| interview_score | integer | yes |
| is_public | boolean | yes |
| location | text | yes |
| previous_roles | text | yes |
| roleplay_score | integer | yes |
| roleplay_unlocked | boolean | yes |
| specialties | ARRAY | yes |
| top_achievement | text | yes |
| updated_at | timestamp with time zone | yes |
| username | text | yes |
| years_experience | integer | yes |

## `rep_supercut_clips`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| ai_reason | text | yes |
| call_id | uuid | yes |
| clip_type | text | **NO** |
| created_at | timestamp with time zone | yes |
| display_order | integer | yes |
| end_seconds | integer | yes |
| is_featured | boolean | yes |
| recording_url | text | yes |
| start_seconds | integer | yes |
| transcript_excerpt | text | yes |

## `rep_testimonials`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| approved | boolean | yes |
| client_company | text | yes |
| client_name | text | **NO** |
| client_title | text | yes |
| content | text | **NO** |
| created_at | timestamp with time zone | yes |
| rating | integer | yes |

## `scraped_contacts`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| call_list_id | uuid | yes |
| campaign_id | uuid | yes |
| confidence | numeric | yes |
| contact_id | uuid | yes |
| created_at | timestamp without time zone | yes |
| notes | text | yes |
| raw_company | text | yes |
| raw_email | text | yes |
| raw_name | text | yes |
| raw_phone | text | yes |
| raw_title | text | yes |
| source | text | yes |
| source_query | text | yes |
| source_url | text | yes |
| status | text | yes |

## `script_objection_logs`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| call_id | uuid | **NO** |
| logged_at | timestamp without time zone | yes |
| objection_id | uuid | **NO** |
| script_id | uuid | **NO** |

## `script_objections`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| follow_up | text | yes |
| objection | text | **NO** |
| response | text | **NO** |
| script_id | uuid | **NO** |
| sort_order | integer | yes |

## `scripts`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| campaign_id | uuid | yes |
| client_id | uuid | yes |
| closing | text | yes |
| created_at | timestamp without time zone | yes |
| discovery | text | yes |
| elevator_pitch | text | yes |
| is_default | boolean | yes |
| opener | text | yes |
| title | text | **NO** |
| updated_at | timestamp without time zone | yes |

## `sequence_steps`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| body | text | **NO** |
| delay_days | integer | yes |
| email_type | text | yes |
| sequence_id | uuid | **NO** |
| step_number | integer | **NO** |
| subject | text | **NO** |

## `slack_integrations`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| bot_token_vault_id | uuid | yes |
| connected_at | timestamp without time zone | yes |
| default_channel | text | yes |
| notify_calls | boolean | yes |
| notify_deals | boolean | yes |
| notify_new_leads | boolean | yes |
| notify_tasks | boolean | yes |
| webhook_url | text | yes |
| workspace_name | text | yes |

## `sms_logs`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| body | text | **NO** |
| contact_id | uuid | yes |
| direction | text | **NO** |
| from_number | text | **NO** |
| intent_label | text | yes |
| intent_score | numeric | yes |
| is_opted_out | boolean | yes |
| phone_number_id | uuid | yes |
| read_at | timestamp with time zone | yes |
| sent_at | timestamp without time zone | yes |
| sms_thread_id | uuid | yes |
| status | text | yes |
| thread_id | uuid | yes |
| to_number | text | **NO** |
| twilio_sid | text | yes |

## `sms_threads`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| contact_id | uuid | yes |
| created_at | timestamp with time zone | yes |
| is_opted_out | boolean | yes |
| last_message_at | timestamp with time zone | yes |
| last_message_body | text | yes |
| last_message_direction | text | yes |
| local_number | text | **NO** |
| phone_number_id | uuid | yes |
| remote_number | text | **NO** |
| unread_count | integer | yes |

## `snippets`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| content | text | **NO** |
| created_at | timestamp without time zone | yes |
| title | text | **NO** |
| trigger | text | **NO** |

## `social_platform_accounts`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| access_token_vault_id | uuid | yes |
| account_handle | text | yes |
| account_name | text | yes |
| account_url | text | yes |
| client_id | uuid | yes |
| created_at | timestamp without time zone | yes |
| followers | integer | yes |
| following | integer | yes |
| last_synced_at | timestamp without time zone | yes |
| notes | text | yes |
| platform | text | **NO** |
| status | text | yes |

## `social_posts`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| ai_generated | boolean | yes |
| asset_id | uuid | yes |
| caption | text | yes |
| client_id | uuid | yes |
| created_at | timestamp without time zone | yes |
| engagement_comments | integer | yes |
| engagement_likes | integer | yes |
| engagement_reach | integer | yes |
| engagement_shares | integer | yes |
| external_post_id | text | yes |
| hashtags | text | yes |
| notes | text | yes |
| platform_account_id | uuid | yes |
| platforms | ARRAY | yes |
| post_url | text | yes |
| published_at | timestamp without time zone | yes |
| scheduled_at | timestamp without time zone | yes |
| status | text | yes |

## `stack_accounts`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| annual_cost | numeric | yes |
| api_key_vault_id | uuid | yes |
| auto_renew | boolean | yes |
| billing_cycle | text | yes |
| cost | numeric | yes |
| created_at | timestamp without time zone | yes |
| login_email | text | yes |
| login_username | text | yes |
| next_billing_date | date | yes |
| notes | text | yes |
| password_vault_id | uuid | yes |
| payment_method_label | text | yes |
| service_category | text | yes |
| service_icon | text | yes |
| service_name | text | **NO** |
| service_url | text | yes |
| status | text | yes |
| tags | ARRAY | yes |
| trial_end | date | yes |
| trial_start | date | yes |
| updated_at | timestamp without time zone | yes |

## `tasks`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| ai_suggested | boolean | yes |
| assigned_to | uuid | yes |
| call_id | uuid | yes |
| campaign_id | uuid | yes |
| completed_at | timestamp without time zone | yes |
| contact_id | uuid | yes |
| created_at | timestamp without time zone | yes |
| description | text | yes |
| due_date | timestamp without time zone | yes |
| priority | text | yes |
| source | text | yes |
| source_id | uuid | yes |
| status | text | yes |
| task_type | text | yes |
| title | text | **NO** |

## `team_member_clients`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| access_level | text | **NO** |
| client_id | uuid | **NO** |
| granted_at | timestamp with time zone | yes |
| granted_by | uuid | yes |
| team_member_id | uuid | **NO** |

## `team_members`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| owner_user_id | uuid | **NO** |
| accepted_at | timestamp without time zone | yes |
| address | text | yes |
| avatar_url | text | yes |
| client_id | uuid | yes |
| commission_rate | numeric | yes |
| contract_type | text | yes |
| department | text | yes |
| emergency_contact_name | text | yes |
| emergency_contact_phone | text | yes |
| end_date | date | yes |
| first_name | text | yes |
| hire_date | date | yes |
| invited_at | timestamp without time zone | yes |
| last_name | text | yes |
| member_email | text | **NO** |
| member_user_id | uuid | yes |
| notes | text | yes |
| pay_frequency | text | yes |
| pay_rate | numeric | yes |
| pay_type | text | yes |
| permissions | jsonb | yes |
| phone | text | yes |
| portal_access | boolean | yes |
| quota_monthly | numeric | yes |
| role | text | yes |
| start_date | date | yes |
| status | text | yes |
| stripe_connect_account_id | text | yes |
| stripe_connect_status | text | **NO** |
| title | text | yes |
| verbal_approved_at | timestamp with time zone | yes |
| verbal_approved_by | uuid | yes |

## `teams_integrations`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| channel_name | text | yes |
| connected_at | timestamp without time zone | yes |
| notify_calls | boolean | yes |
| notify_deals | boolean | yes |
| notify_new_leads | boolean | yes |
| webhook_url | text | **NO** |

## `tech_stack_items`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| active | boolean | yes |
| billing_cycle | text | yes |
| campaign_ids | ARRAY | yes |
| category | text | yes |
| created_at | timestamp without time zone | yes |
| monthly_cost | numeric | yes |
| name | text | **NO** |
| notes | text | yes |
| project_ids | ARRAY | yes |
| url | text | yes |

## `templates`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| body | text | **NO** |
| category | text | yes |
| created_at | timestamp without time zone | yes |
| name | text | **NO** |
| subject | text | yes |
| type | text | **NO** |
| use_count | integer | yes |

## `time_entries`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| billable | boolean | yes |
| campaign_id | uuid | yes |
| client_id | uuid | yes |
| created_at | timestamp without time zone | yes |
| description | text | yes |
| duration_minutes | integer | **NO** |
| duration_seconds | integer | yes |
| ended_at | timestamp with time zone | yes |
| entry_date | date | yes |
| hourly_rate | numeric | yes |
| project_id | uuid | yes |
| started_at | timestamp with time zone | **NO** |

## `user_preferences`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| contact_default_type | text | yes |
| contact_required_fields | ARRAY | yes |
| dashboard_layout | jsonb | yes |
| microphone_device_id | text | yes |
| notification_sounds | boolean | yes |
| sidebar_items | jsonb | yes |
| speaker_device_id | text | yes |
| spotify_tokens | jsonb | yes |
| theme | text | yes |
| updated_at | timestamp without time zone | yes |
| widget_settings | jsonb | yes |

## `user_sessions`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| created_at | timestamp without time zone | yes |
| duration_seconds | integer | yes |
| session_end | timestamp without time zone | yes |
| session_start | timestamp without time zone | yes |

## `user_settings`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| agency_address | text | yes |
| agency_logo_url | text | yes |
| agency_name | text | yes |
| agency_phone | text | yes |
| agency_website | text | yes |
| auto_record_calls | boolean | yes |
| auto_score_on_import | boolean | yes |
| auto_transcribe_calls | boolean | yes |
| call_retry_interval_hours | integer | yes |
| call_retry_limit | integer | yes |
| company_email | text | yes |
| company_name | text | yes |
| company_phone | text | yes |
| company_website | text | yes |
| created_at | timestamp without time zone | yes |
| currency | text | yes |
| daily_digest_email | boolean | yes |
| data_retention_months | integer | yes |
| default_call_type | text | yes |
| default_from_number | text | yes |
| default_task_priority | text | yes |
| email_signature | text | yes |
| email_voicemail_transcripts | boolean | yes |
| hourly_rate | numeric | yes |
| invoice_footer | text | yes |
| invoice_header | text | yes |
| invoice_logo_url | text | yes |
| notify_missed_calls | boolean | yes |
| notify_new_deals | boolean | yes |
| notify_new_leads | boolean | yes |
| notify_overdue_tasks | boolean | yes |
| notify_voicemails | boolean | yes |
| recording_compliance_enabled | boolean | yes |
| recording_compliance_message | text | yes |
| sidebar_hidden_items | ARRAY | yes |
| sidebar_item_order | jsonb | yes |
| sms_auto_reply | text | yes |
| smtp_host | text | yes |
| smtp_pass_encrypted | text | yes |
| smtp_port | integer | yes |
| smtp_user | text | yes |
| subscription_tier | text | yes |
| timezone | text | yes |
| twilio_account_sid | text | yes |
| twilio_api_key_secret | text | yes |
| twilio_api_key_sid | text | yes |
| twilio_auth_token | text | yes |
| twilio_client_identity | text | yes |
| twilio_phone_number | text | yes |
| twilio_twiml_app_sid | text | yes |
| updated_at | timestamp without time zone | yes |
| working_days | ARRAY | yes |
| working_hours_end | text | yes |
| working_hours_start | text | yes |

## `voicemail_drops`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| audio_url | text | yes |
| created_at | timestamp without time zone | yes |
| duration_seconds | integer | yes |
| is_default | boolean | yes |
| title | text | **NO** |

## `voicemails`

| column | type | nullable |
|---|---|---|
| id | uuid | **NO** |
| user_id | uuid | **NO** |
| caller_id | text | **NO** |
| caller_name | text | yes |
| duration_seconds | integer | yes |
| listened_at | timestamp without time zone | yes |
| phone_number_id | uuid | yes |
| received_at | timestamp without time zone | yes |
| recording_url | text | yes |
| status | text | yes |
| transcript | text | yes |
