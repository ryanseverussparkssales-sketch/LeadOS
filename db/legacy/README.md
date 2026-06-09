# Legacy SQL — historical, do not reapply

These are the ad-hoc `.sql` files that lived at the repo root before the 2026-06-09
migration consolidation. They were applied to production piecemeal over time, in no
recorded order, and several disagree with each other and with prod.

**They are kept for history only.** The source of truth is now
`supabase/migrations/0000_baseline.sql` (a full dump of prod), with ordered
`NNNN_*.sql` migrations after it. See `supabase/migrations/README.md`.

Do not run anything in this folder against any database. If you need to know what the
schema *is*, read `docs/db/SCHEMA-REFERENCE.md` or the baseline.
