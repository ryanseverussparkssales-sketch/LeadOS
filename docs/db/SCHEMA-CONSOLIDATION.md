# Schema Consolidation — Runbook & Plan

## Situation
- **61 `*.sql` files at the repo root**, no ordering, no migration runner, no `schema_migrations` ledger.
- **All of them have already been applied to prod** (per the owner). So **prod = the complete, correct schema** — the union of every file. The app works because of this.
- The drift the audit found (`COMPLETE-SCHEMA.sql` missing `contacts.is_test`, `utm_*`, `deleted_at`, tables `campaign_contacts`/`call_feedback`, `time_entries` defined 6 ways, etc.) is **drift in the files, not in prod.** No single file reflects prod.

## Therefore
The fix is **not** a column-adding reconciliation migration (prod already has the columns). It is:
1. **Dump prod once → that dump becomes the canonical baseline** (`supabase/migrations/0000_baseline.sql`).
2. Adopt the migrations folder + CLI as the ledger going forward.
3. Archive the 61 root files (history only).

Only you can run the dump (DB credentials). Everything below is the runbook; the scaffolding (`supabase/migrations/`, `db/legacy/`) is already created.

---

## Runbook

### Step 1 — (optional) Confirm prod really has everything
Run `supabase/verify-schema.sql` (in this repo) in the Supabase SQL editor against prod. It checks the app-critical tables/columns. **Expected result: zero rows** (nothing missing). If anything shows up, that's a file you thought you ran but didn't — apply it before dumping.

### Step 2 — Capture the baseline (the one authoritative artifact)
Pick ONE:

**A. Supabase CLI (preferred)**
```
npm i -g supabase
supabase login
supabase link --project-ref <your-project-ref>      # ref is in the dashboard URL
supabase db dump --schema public -f supabase/migrations/0000_baseline.sql
```

**B. pg_dump (if you have the connection string)**
```
pg_dump --schema-only --no-owner --no-privileges "$DATABASE_URL" \
  > supabase/migrations/0000_baseline.sql
```
(Connection string: Supabase dashboard → Project Settings → Database → Connection string. Use the **direct** connection, not the pooler, for a clean dump.)

Commit `0000_baseline.sql`. **This file — not `COMPLETE-SCHEMA.sql` — is now the source of truth.** It already contains every column/table/index/policy/function prod has.

### Step 3 — Tell the CLI prod already matches the baseline
You don't re-apply the baseline to prod (it's already there). Register it as applied so future `db push` only sends *new* migrations:
```
supabase migration repair --status applied 0000
```

### Step 4 — Prove rebuildability (the whole point of this exercise)
On a throwaway/shadow DB (Supabase branching, or local `supabase start`):
```
supabase db reset        # rebuilds from 0000_baseline.sql (+ any later migrations) from scratch
```
Then run `verify-schema.sql` against the shadow → **zero rows**. Now you have a reproducible environment and disaster recovery.

### Step 5 — Archive the legacy files
Once Step 4 passes:
```
git mv RUN-ALL-PENDING-SQL.sql supabase-*.sql feature-migrations.sql \
       scale-indexes.sql phone-number-health-migration.sql db/legacy/   # adjust globs as needed
```
Keep data/seed files where your tooling references them (`test-data.sql`, `supabase-knowledge-base-seed.sql`, `supabase-notion-import.sql`). Add `db/legacy/README.md`: "Historical, pre-consolidation SQL. Source of truth is `supabase/migrations/`." Update `CLAUDE.md`'s "SQL migrations to run" section to describe the CLI flow.

### Going forward
- Every schema change: `supabase migration new <name>` → edit the SQL → test on shadow (`db reset`) → `supabase db push`.
- **Never** hand-paste ad-hoc root `*.sql` into prod again. That is what created the drift.

---

## File manifest (for the Step 5 archive)
| Category | Files |
|---|---|
| Full-schema candidates (superseded by the prod dump) | `supabase-COMPLETE-SCHEMA.sql`, `supabase-RUN-THIS-ALL-PENDING.sql`, `supabase-RUN-PENDING-AFTER-CAMPAIGNS.sql`, `supabase-setup.sql`, `supabase-schema.sql` |
| Superseded bundles | `RUN-ALL-PENDING-SQL.sql`, `supabase-RUN-ALL-15-BLOCKS.sql`, `supabase-RUN-ALL-PENDING-2026.sql`, `supabase-NEW-SINCE-LAST-RUN.sql` |
| Per-feature migrations (folded into baseline) | all `supabase-migration-*.sql`, `feature-migrations.sql`, `supabase-utm-metadata.sql`, `supabase-soft-delete.sql`, `supabase-scraper-upgrade.sql`, `supabase-win-conditions.sql`, `supabase-*cadence*.sql`, `supabase-campaign-*.sql`, `supabase-client-*.sql`, `supabase-email-*.sql`, `supabase-gmail-oauth.sql`, `supabase-phone-features.sql`, `supabase-reply-routing.sql`, `supabase-routing-rules.sql`, `supabase-rate-limiting.sql`, `supabase-storage-assets.sql`, `supabase-widgets-spotify.sql`, `supabase-stack-manager.sql`, `supabase-documents-upgrade.sql`, `supabase-invoice-enhancements.sql`, `supabase-cron-support.sql`, `supabase-contact-activities.sql`, `supabase-companies.sql`, `supabase-sms-inbox.sql`, `supabase-email-inbox.sql`, `supabase-contact-fields.sql` |
| Indexes (in the dump already, once applied) | `scale-indexes.sql`, `phone-number-health-migration.sql` |
| Seeds / data (keep — not schema) | `supabase-knowledge-base-seed.sql`, `supabase-notion-import.sql`, `test-data.sql` |

## Safety
- The dump is read-only on prod. Archival is a `git mv`, not a DB change. Nothing here drops or alters live data.
- Always run Step 4 on a shadow DB before relying on the baseline for recovery.
