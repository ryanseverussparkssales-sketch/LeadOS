# Schema Audit — 2026-06-09

Static analysis of every Supabase query in `src/` (951 column references across 92
tables) diffed against the live production schema (`information_schema` snapshot,
93 tables). This is the same bug class that broke inbound calls three separate
ways today: code referencing columns that don't exist fails **silently** because
supabase-js returns errors instead of throwing, and most call sites discard them.

## How to apply

1. Run `supabase-schema-drift-2026-06-09.sql` in the Supabase SQL Editor (idempotent).
2. Make the code fixes listed below (column adds can't fix these).
3. Re-test the affected features.

## Features broken by missing columns (fixed by the migration)

| Feature | What was failing |
|---|---|
| **Outbound call logging** | `/api/calls/start` inserts `calls.campaign_id` unconditionally → every desk-phone outbound insert fails → no call rows, no recordings correlation |
| Recording pipeline | `hooks.server.ts` updates `calls.processed_at` (column missing) |
| Add/edit client | insert includes `notes, tags, timezone, linkedin_url, primary_contact_*` — none existed |
| Client portal overview | embeds `clients.website/industry/logo_url/contract_*` |
| Inbound SMS threading | `sms_threads.contact_name/contact_phone/direction/last_message/unread`, `sms_logs.intent/intent_confidence/is_hot` |
| Quotas | `quotas.current_value/updated_at` |
| Agency dashboard | embeds `projects.status/calls_today/target_wins/win_count/daily_call_goal` |
| Sequences | `contact_sequences.user_id` (advance), `sequence_steps.delay_hours/step_order` (enroll) |
| Appointments → tasks | `tasks.hour/minute/notes` |
| Notifications / soft deletes | `tasks.deleted_at`, `calls.deleted_at`, `contact_documents.deleted_at` |
| Cron daily reset | `phone_numbers.calls_today` |
| Spotify connect | `user_preferences.access_token/refresh_token/scope/expires_at` |
| Campaign wins | `profiles` table never existed |
| AI chat data lookups | `campaigns.user_id`, `contacts.is_test/lead_score/tags`, `campaigns.is_test` |
| Gmail account toggle | `email_accounts.is_active` |
| Inbound email threading | `email_threads.campaign_id` |

## Code fixes required (column adds would be wrong — fix the code instead)

| Location | Problem | Fix |
|---|---|---|
| `routes/api/reps/[userId]/coaching/+server.ts` | selects `calls.duration` | use `call_duration_seconds` |
| `routes/api/ai/chat/+server.ts` | selects `calls.duration_seconds` | use `call_duration_seconds` |
| `routes/api/ai/chat/+server.ts` | filters `deals.name` | deals uses `title` |
| `routes/api/campaigns/+server.ts` | filters `projects.project_id` | typo — likely `campaigns.project_id` or `projects.id` |
| `routes/+page.svelte` | filters `team_members.user_id` | use `owner_user_id` or `member_user_id` |
| `routes/api/payouts/+server.ts` | filters `team_members.team_member_id` | use `team_members.id` |
| `routes/api/cron/client-reports/+server.ts`, `routes/api/portal/client/+server.ts` | query a `settings` table that doesn't exist | use `user_settings` (map `email`→`company_email`, `agency_email_from`→decide) |

## Verify separately

- `.from('assets')` calls in `marketing/assets/upload` and `numbers/+page.svelte`
  are **storage bucket** references, not tables — confirm an `assets` bucket exists
  in Supabase Storage.
- NOT NULL watch list: these tables have NOT NULL columns; any insert that omits
  them dies like the `calls.contact_id` bug did. Highest-risk: `appointments.contact_id`
  (NOT NULL — walk-in appointments with no contact will fail), `campaign_wins.contact_id`,
  `api_usage_log.call_id`, `engagements.base_fee/bonus_rate`, `payouts.amount_cents`.
  Relax constraints as features need them.
- Tables in DB never referenced by code (candidates for cleanup): `asset_shares`,
  `cron_logs`, `dialer_activity`, `user_sessions`.

## Preventing recurrence

1. **Stop running ad-hoc SQL editor queries as the migration story** — there are
   ~100 unlabeled saved queries with no record of what ran where. Adopt
   `supabase migration` files in-repo (even just numbered .sql files applied in
   order) so the repo is the source of truth.
2. **Check supabase-js errors.** `const { error } = await ...insert(...)` —
   log every error. The silent-discard pattern is why all of today's failures
   were invisible.
3. Re-run this audit after big features: regenerate the code expectations
   (script preserved in repo history / ask Claude) and re-diff.
