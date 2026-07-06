# RogueOS Scale-Up Execution Plan — parallel agent waves

Goal: the "adding clients and SDRs" improvement set, executed by parallel agents in three waves.
Workstreams within a wave touch **disjoint files** so agents never collide. Waves are sequential;
each ends with a verification gate before the next starts.

---

## Agent contract (embedded in every agent prompt)

1. Svelte 5 runes only (`$state`/`$derived`/`$effect`/`$props`); no `$:`.
2. `{@const}` only inside block tags; never `on*|modifier` — use `(e) => { e.stopPropagation(); … }`.
3. Edit files with the Edit/Write tools only — never bash `open().write()` on the mount.
4. Never truncate: files end with a sane terminator; `{#if}`/`{#each}` must pair (self-check counts before finishing).
5. Every `supabaseAdmin` mutation scoped by `user_id`/owner (tenancy is code-level; RLS is bypassed).
6. New tables/columns → a NEW ordered file in `supabase/migrations/` (numbers pre-assigned below; never reuse).
7. Follow existing UI conventions (dark surfaces #0d0d0d/#111, `apiFetch`, `toastSuccess/toastError`, Icon component).
8. No `npm run build` in the sandbox (EPERM). Static self-checks only.
9. Report: files touched, migrations added, anything deferred + why.

## File-ownership matrix (conflict prevention)

| Workstream | Owns (exclusive) |
|---|---|
| 1A | `src/routes/(app)/clients/**`, `src/routes/api/clients/onboard/**` (new) |
| 1B | `src/routes/api/cron/client-digest/**` (new), `src/lib/server/clientDigest.ts` (new), `vercel.json`, migration 0007 |
| 1C | `src/routes/api/agency/+server.ts`, `src/routes/(app)/agency/+page.svelte` |
| 1D | `src/lib/server/db.ts` (new), `src/lib/server/rateLimit.ts` (new), `src/routes/api/webhook/[token]/+server.ts`, `src/hooks.server.ts` (handleError only), `package.json` (Sentry dep note only — do NOT install) |
| 2E | `src/routes/(app)/pipeline/+page.svelte`, `src/routes/api/deals/+server.ts`, `src/routes/api/deals/forecast/+server.ts` |
| 2F | `src/routes/(app)/contacts/+page.svelte`, `src/routes/api/contacts/bulk/**` (new) |
| 2G | `src/routes/(app)/numbers/**`, `src/routes/api/phone/health/**` (new) |
| 2H | `src/routes/(app)/sequences/**`, `src/routes/api/sequences/**`, migration 0008 |
| 3I | `src/routes/book/**` (new public), `src/routes/api/booking/**` (new), migration 0009 |
| 3J | `src/routes/api/cron/gmail/**` (or wherever gmail sync cron lives) |

Shared files (`lib/server/supabase.ts`, `lib/api.ts`) are read-only for all agents; changes there go through me between waves.

---

## Wave 1 — visible to new clients/SDRs immediately (4 agents in parallel)

### 1A · Client onboarding wizard
"New Client" wizard on /clients: one form (name, brand color/logo optional, campaign name, script template,
call list) → single new endpoint `POST /api/clients/onboard` that transactionally creates
client → project → campaign (+ `campaign_sdrs` if SDRs selected) → call list → links them.
Existing single-purpose endpoints stay untouched. Acceptance: one submit produces a dialable campaign.

### 1B · Weekly client digest email
Migration `0007_client_digest.sql`: `clients.digest_enabled boolean default false`, `clients.digest_email text`.
`lib/server/clientDigest.ts`: per-client weekly stats (dials, connects, wins, appointments by campaign — reuse
the aggregation patterns from `api/agency`) rendered to a simple branded HTML email via Resend.
New cron `GET /api/cron/client-digest` (CRON_SECRET-gated, same pattern as existing crons) + `vercel.json`
schedule Monday 13:00 UTC. Opt-in toggle on the client detail page is 1A's file — so expose it via the client
PATCH API only; UI toggle goes in during verification wave.

### 1C · Agency dashboard accuracy
In `api/agency/+server.ts`: (a) scope the today-calls query with `.in('user_id', [...allUserIds])`;
(b) replace the divided queue estimate with real per-SDR depth: `campaign_sdrs` → campaigns → call lists →
pending counts, grouped per SDR (keep it ≤2 extra queries, aggregate in JS). Update the SDR cards in
`agency/+page.svelte` if the field shape changes.

### 1D · Infra hardening
(a) `lib/server/db.ts`: `mustInsert/mustUpdate/mustDelete` — wrap a supabase result, log
`[db] <table> <op> failed: <error>` and throw; apply to the ~10 highest-value write paths (calls logging,
contacts insert, payouts, webhook contact create).
(b) Rate limit: `lib/server/rateLimit.ts` (fixed-window in-memory, keyed token+IP, 60/min default) applied
to `api/webhook/[token]` and the embed-form submit path; 429 with Retry-After.
(c) Sentry: wire `handleError` in hooks to report when `SENTRY_DSN` is set (dynamic import, no hard dep;
add `@sentry/sveltekit` to package.json but degrade gracefully if uninstalled).

**Gate 1:** block-balance + tenancy scan over all Wave-1 files; reconcile any shared-file requests; Ryan runs `npm run build` + commits.

## Wave 2 — SDR productivity (4 agents in parallel)

### 2E · Pipeline client filter
Client dropdown on pipeline page filtering the kanban; `?client_id=` support on `GET /api/deals` and
`GET /api/deals/forecast` (scoped `.eq('client_id', …)` after ownership). Forecast strip reflects the filter.

### 2F · Bulk actions in contacts
Checkbox multi-select in the contacts list (+ select-all-page), action bar: add tag, assign to campaign,
add to call list, mark DNC, soft-delete. New `POST /api/contacts/bulk` `{ ids, action, payload }` — validates
ALL ids belong to owner in one query before acting; chunked updates; per-action audit log line.

### 2G · Phone number health
New `GET /api/phone/health`: per number — calls today vs `daily_limit`, 7-day volume, last-used, status.
On /numbers: usage bar per number, ⚠ at 80% of daily limit, "rotate" hint when over. Optional: exclude
over-limit numbers from local-presence selection if that selection code is in the numbers module (defer if not).

### 2H · Multi-channel cadences (largest — start first)
Migration `0008_sequence_channels.sql`: `sequence_steps.channel text default 'email'` (email|sms|call_task)
+ nullable `sms_body`. Engine (`api/sequences/advance`): on sms step → send via existing SMS path (respect
GUPPY-style comms gating if present; honest-fail without creds); on call_task step → insert a task
(`task_type:'call'`, due now) for the assigned SDR. UI: step type selector + per-type fields in the sequence
builder. DNC/quiet-hours check before SMS.

**Gate 2:** same as Gate 1.

## Wave 3 — bigger bets (2 agents in parallel)

### 3I · Public booking links
Migration `0009_booking_links.sql`: `booking_links` (user_id, slug unique, title, duration_minutes,
availability jsonb weekly windows, timezone, campaign_id nullable, active). Public `/book/[slug]`:
next-14-days slot picker (availability minus existing appointments), form (name/email/phone/notes) →
creates appointment + contact (dedup by email/phone) + ICS email via Resend to both sides. Rate-limited
(reuse 1D limiter). Management UI under settings or /calendar. No external calendar sync in v1.

### 3J · Gmail sync batching
Rewrite the gmail cron: batch account fetch, per-account message list with `maxResults`, batched DB
upserts (single `.upsert` per account, not per message), 45s time-box with cursor persistence so the next
run resumes. Keep behavior identical otherwise.

**Gate 3 / Final verification:** cross-cutting agent pass — block balance repo-wide, tenancy grep on all new
mutations, migration order sanity (0007–0009), env var additions documented in VERCEL-LAUNCH-CHECKLIST.md,
update CLAUDE.md "Current status". Then Ryan: run migrations, `npm run build`, deploy, smoke test.

---

## Sequencing summary

| Wave | Agents | Est. wall time | Ryan actions after gate |
|---|---|---|---|
| 1 | A B C D | one session | build + commit + deploy; set SENTRY_DSN (optional) |
| 2 | E F G H | one session | run 0008, build, deploy |
| 3 | I J | one session | run 0009, build, deploy; add cron to vercel dashboard if needed |

New env vars introduced: `SENTRY_DSN` (optional, 1D). New crons: `/api/cron/client-digest` (1B).
