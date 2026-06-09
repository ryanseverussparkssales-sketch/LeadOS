# Database Migrations — Source of Truth

This directory is the **single source of truth** for the LeadOS database schema.
Before 2026-06-09 there were 60+ ad-hoc `.sql` files at the repo root with no ordering
and no record of what had been applied to production. That sprawl caused every
schema-drift bug (code referencing columns that didn't exist, failing silently).

## The model

- **`0000_baseline.sql`** — a complete dump of the production schema as it stood on
  2026-06-09 (tables, columns, defaults, constraints, FKs, indexes, RLS, policies,
  functions). Production already matches this; it's the rebuildable starting point.
- **`0001_*.sql`, `0002_*.sql`, …** — every schema change after the baseline, in order,
  one file per change. Numbered so the history is unambiguous.
- The old root files are archived in **`db/legacy/`** (history only — never reapply them).
- Seed/data scripts live in **`db/seeds/`** (not schema; run manually as needed).
- **`docs/db/SCHEMA-REFERENCE.md`** — a human-readable column list, regenerated from prod.
  Check code against this before assuming a column exists.

## Rules going forward

1. **Never hand-paste ad-hoc SQL into the prod SQL editor as the only record.** Every
   schema change gets a numbered file here first, then is applied.
2. New change: create `NNNN_short_description.sql` (next number), write idempotent DDL
   (`ADD COLUMN IF NOT EXISTS`, `CREATE … IF NOT EXISTS`, `CREATE OR REPLACE`), apply it,
   and commit. End the file with `NOTIFY pgrst, 'reload schema';` so PostgREST picks up
   new columns immediately.
3. After applying, regenerate `docs/db/SCHEMA-REFERENCE.md` (query below) so the
   reference never drifts from reality.

## Regenerating the baseline / reference

No Supabase CLI or `pg_dump` on the dev machine, so both are produced from the SQL
editor instead.

**Full DDL baseline** — run in the Supabase SQL Editor, copy the single result cell into
`0000_baseline.sql`:

```sql
-- (the catalog → DDL query; see commit that introduced this file, or ask the assistant)
-- Emits CREATE TABLE + ALTER … ADD CONSTRAINT + indexes + RLS + policies + functions.
```

**Column reference** — run in the SQL Editor, copy the cell, regenerate the markdown:

```sql
select json_object_agg(table_name, cols) from (
  select c.table_name,
    json_object_agg(c.column_name,
      json_build_object('type', c.data_type, 'nullable', c.is_nullable = 'YES')) as cols
  from information_schema.columns c
  where c.table_schema = 'public'
  group by c.table_name
) t;
```

## Proper tooling later (recommended)

When convenient, adopt the Supabase CLI so this becomes fully automated:

```
npm i -g supabase
supabase link --project-ref legzdsbemjowgddwavbi
supabase db dump --schema public -f supabase/migrations/0000_baseline.sql
supabase migration repair --status applied 0000   # prod already matches
# new change → supabase migration new <name> → edit → supabase db push
```
