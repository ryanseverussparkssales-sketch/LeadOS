# Seed & data scripts

Manual, run-as-needed data scripts (not schema). These are NOT migrations and are not
part of the schema source of truth.

- `test-data.sql` — sample/dev data.
- `supabase-knowledge-base-seed.sql` — seeds client knowledge-base content.
- `supabase-notion-import.sql` — one-off Notion import.

Run by hand in the SQL editor when needed. Schema lives in `supabase/migrations/`.
