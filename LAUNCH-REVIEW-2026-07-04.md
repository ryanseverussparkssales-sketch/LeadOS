# RogueOS Launch-Readiness Review — 2026-07-04

Full-codebase review (4 parallel audits: core flows, security delta since AUDIT-2026-06-09, Svelte correctness, deploy/config). Verdict: **launch-ready after the checklist below**. Two tenancy bugs were found and **fixed in this session**.

---

## Fixed today (committed to working tree, needs commit + deploy)

1. **`api/templates/[id]` PATCH** — `use_count` update ran unscoped by `user_id` (any logged-in user could bump another tenant's counter). Now 404s if not owner and scopes the update. `src/routes/api/templates/[id]/+server.ts:25-27`
2. **`api/calls/[id]` PATCH** — the `callRecord` read was unscoped, so the downstream `call_list_contacts` / `campaign_contacts` timestamp writes could touch another tenant's rows. Read now scoped `.eq('user_id', user.id)`, which scopes everything downstream. `src/routes/api/calls/[id]/+server.ts:39`

---

## What's healthy (verified)

- **Core flows all fully wired end-to-end**: dialer (token refresh, AMD, recording→Groq transcription, quick-log, power-dial auto-advance, DNC block), contacts (CSV import w/ dedup preview, filtered pagination, custom fields), campaigns (SDR assignment, win RPC, client win emails), agency ops (aggregated command center, **real Stripe Connect payouts with idempotency keys — not stubbed**), SDR portal, client portal (correctly scoped to `client_id` + `portal_access`), sequences (Resend + cron advance).
- **Prior audit fixes hold**: C1 recording SSRF, H1/H2 IDORs, H3 quotas race (now atomic RPC w/ JS fallback), M5 voicemail-drop callSid validation — all verified in current code.
- **New code since 2026-06-09 is clean**: 13 admin endpoints all behind `requireSuperAdmin`; semantic search scoped; file uploads validate ownership; portal share tokens expire (30 days).
- **Svelte correctness**: zero `{@const}` placement violations, zero `on*|modifier` patterns, zero legacy `$:`, block balance perfect (1013/1013 `{#if}`, 541/541 `{#each}`), no truncated files. The truncation bug class is gone.
- **Migrations**: the 66-file SQL sprawl is resolved — `supabase/migrations/` is now authoritative (`0000_baseline.sql` + 0001–0005 ordered). Fresh deploy is repeatable.
- **Secrets**: `.env.local` gitignored, no secrets in tracked files, no test backdoors.
- **Crons**: all 4 in `vercel.json` exist and check `CRON_SECRET`.

---

## Remaining blockers before deploy (in order)

1. **Env vars** — VERCEL-LAUNCH-CHECKLIST.md lists 9; code uses **23**. Load-bearing ones missing from the checklist: `CRON_SECRET`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_PHONE_NUMBER`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `PUBLIC_SITE_URL`, `VAULT_ENCRYPTION_KEY`, `RELAY_WS_URL` (only if AI/practice calls enabled). Add all to Vercel before deploying. (`VOYAGE_API_KEY` in `.env.example` is dead — remove.)
2. **Set `RESEND_WEBHOOK_SECRET` in prod** — `api/emails/inbound` fails **open** without it (forgeable inbound email). Either set it or make the route fail closed when `NODE_ENV=production`.
3. **Neutralize `TWILIO_SKIP_SIGNATURE_CHECK` in prod** — `lib/server/twilioVerify.ts:22` still honors it globally. One-line guard: ignore the flag when `NODE_ENV === 'production'`.
4. **`api/deals` POST** — accepts `contact_id` without verifying it belongs to the caller. Add an ownership read before insert (same pattern as the fixes above). ~15 min.
5. **Migrations on prod Supabase** — confirm baseline + 0001–0005 applied; enable Realtime on `voicemails`, `missed_calls`, `contacts`, `tasks`.
6. **Webhook URLs** — Twilio (voice/status/recording/incoming) and Stripe webhook pointed at the production domain; Supabase Auth site/redirect URLs updated.
7. **relay-server** — separate Node WS service (Railway/Render/Fly), required only for AI qualification + practice calls; everything else degrades gracefully (503) without it. Deploy it or disable `PRACTICE_CALLS_ENABLED`.

## Post-launch backlog (not blocking)

- **Gmail sync cron N+1** — serial per-account/per-message queries; will hit function timeout as accounts grow. Batch it.
- **Silent supabase errors** — ~33 empty catches / ~70% of `.from()` calls discard `{error}` (M6 from prior audit). Add a `mustInsert()`-style helper + lint rule; this pattern caused past incidents.
- **Enhance `scripts/check-tenancy.mjs`** — it passes today but missed both bugs fixed above because they filter by `id` without owner scope. Flag id-only mutations as warnings.
- **45 svelte-check type errors** — pre-existing, no runtime impact; burn down for editor sanity.
- **Inbound SMS webhook** — schema exists, handler doesn't.
- **Coaching UI** — `call_feedback` table exists, no collection UI.
- **Fonts** — Miller Banner not installed; Bodoni fallback works. Buy or commit to fallback.
- Dead code: `recording-proxy` route (secured but unused), orphaned `DialButtonPicker/LazyWidget/Skeleton` components; package name still `rogueos-mvp`.

## Stale docs to update

- `VERCEL-LAUNCH-CHECKLIST.md` — env list incomplete (see #1); Step 8 (CSRF trustedOrigins) is obsolete — code intentionally uses `checkOrigin: false` with Twilio signature verification instead.
- `CLAUDE.md` — deploy path says `RogueOS\rogueos-mvp`; actual folder is `LeadOS\leadosuite-mvp`. relay-server + admin slice not mentioned.

---

## Suggested order of operations

1. Commit today's two fixes → 2. Apply items 2–4 (≈1 hour) → 3. `npm run build` locally (Windows, not sandbox) → 4. Vercel env vars (full 23-var list) → 5. Migrations + Realtime → 6. Deploy → 7. Repoint webhooks → 8. Smoke test: login → import 5 contacts → dial → log outcome → client portal shows it → approve a payout in test mode.
