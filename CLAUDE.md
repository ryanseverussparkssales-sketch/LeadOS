# RogueOS — Project Brief for AI Sessions

## What this is
RogueOS is a full-stack sales outreach platform built for RogueLeads (Ryan Sparks).
Two brands, one codebase:
- **RogueOS** — SaaS platform ($20/mo basic, $40+$5/seat pro). Power dialer, CRM, agency tools.
- **RogueLeads** — Managed SDR agency. $1/contact + $200/appointment setting.

## Tech stack
- SvelteKit (Svelte 5 runes) + TypeScript + Tailwind CSS
- Supabase (PostgreSQL + Auth + Storage)
- Twilio (Voice SDK, SMS, phone numbers)
- Stripe Connect (rep payouts)
- Resend (transactional email + ICS attachments)
- Anthropic Claude (AI brief, call summaries, coaching, script generation)
- Vercel (hosting, cron jobs)

## Three user views (auto-routed on login)
1. **Admin/Owner** → `/dashboard` — Full agency management, all features
2. **SDR/Rep** → `/sdr` — Dialer-focused, campaign-scoped, limited to their data
3. **Client** → `/client-portal` — Branded portal, see their campaigns/appointments

Auth routing is in `src/routes/+page.svelte` → `getPostLoginRoute()`.

## Module map — where things live

### Dialing (`src/routes/(app)/dialer`)
Core SDR dialer. Power dialer, local presence, AMD + voicemail drop, quick-log postmortem.
Key component: `src/lib/components/Dialer.svelte`
Twilio token: `src/routes/api/twilio/token/+server.ts`
Twilio voice: `src/routes/api/twilio/voice/+server.ts` (also `src/hooks.server.ts`)

### Agency Operations (`src/routes/(app)/agency/`)
- `/agency` — Command center (team stats, client overview, wins feed) — realtime via Supabase
- `/agency/pool` — Lead pool distribution to campaigns
- `/agency/calls` — Call review + manager coaching notes
- `/agency/payouts` — Approve wins, Stripe Connect payout to reps

### Clients (`src/routes/(app)/clients`)
Full client CRM. Knowledge base, AI insights, engagement rates, docs portal.
Client portal for brands: `src/routes/(app)/client-portal/+page.svelte`

### Campaigns (`src/routes/(app)/campaigns`)
Campaign management, SDR assignment, win tracking, call list assignment.
API: `src/routes/api/campaigns/`

### Contacts (`src/routes/(app)/contacts`)
100k-scale contact database. Batch import, routing rules, bulk DNC.
CSV import: `src/routes/api/contacts/+server.ts` (batch 500 rows)
Contacts list: `src/routes/api/contacts/filtered/+server.ts` (paginated, is_test filtered)

### SDR Portal (`src/routes/sdr/`)
- `/sdr` — Dialer (gated behind verbal approval)
- `/sdr/getting-started` — Onboarding checklist (verbal call → campaigns → scripts → interview)
- `/sdr/coaching` — AI analysis + manager feedback
- `/sdr/performance` — Stats + Stripe Connect for payouts
- `/sdr/profile` + `/sdr/portfolio` — Marketplace profile + supercut clips
- `/sdr/interview` — AI interview (score ≥ 70 unlocks marketplace listing)

### Booking Links (`src/routes/(app)/booking-links` + `src/routes/book/[slug]`)
- `/booking-links` — manage public scheduling links (title, duration, availability windows, buffer, horizon)
- `/book/[slug]` — PUBLIC booking page (no auth); creates contact + appointment + owner task, emails ICS confirmations
- API: `src/routes/api/booking/` (`links`, `links/[id]`, `[slug]/slots`, `[slug]/book` — public routes rate-limited)

### Public Site
- `/` — Landing + login
- `/pricing` — $20 basic / $40+$5/seat / managed services tiers
- `/join` — SDR recruitment (verbal call required before dialing)
- `/coaching` — Sales coaching landing page
- `/about` — About RogueLeads
- `/marketplace` — Rep discovery for brands
- `/contact` — Brand inquiry form
- `/terms` + `/privacy` — Legal pages

## Design system
Fonts: Miller Banner Light (display, to be licensed) → Playfair Display fallback
       Cormorant SC (section labels, nav groups)
       Inter (all UI text)
Colors: 4 surfaces (#000, #080808, #0f0f0f, #141414), 3 borders (#0d0d0d, #1a1a1a, #262626)
Defined in: `src/app.css`

## Key environment variables (Vercel)
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, TWILIO_APP_SID
TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_CLIENT_IDENTITY
STRIPE_SECRET_KEY
RESEND_API_KEY, RESEND_FROM
ANTHROPIC_API_KEY
CRON_SECRET, PUBLIC_SITE_URL
DISCORD_WEBHOOK_URL (optional — wins feed)
GROQ_API_KEY (optional — voicemail transcription)

## SQL migrations to run (in Supabase SQL Editor)
Run these in order if not already done:
1. `supabase-setup.sql` — Core tables
2. `feature-migrations.sql` — call_feedback, payouts, Stripe columns, verbal_approved_at
3. `scale-indexes.sql` — Database indexes for 100k contacts
4. `phone-number-health-migration.sql` — calls_today/daily_limit
5. `test-data.sql` — Demo data (optional, see file for setup)

## Deployment
**DO NOT build locally** — `.svelte-kit` EPERM issue in sandbox.
Deploy from Windows terminal: `cd "C:\Users\Ryan\Lead Os\RogueOS\rogueos-mvp" && vercel deploy --prod`
Vercel project: `lead-os` / team: `ryanseverussparkssales-8247s-projects`
Live URL: `https://lead-os-livid.vercel.app`

## Rules for future sessions
1. Read this file first. Then read `SVELTE_RULES.md` for coding conventions.
2. **Svelte 5 runes only** — `$state`, `$derived`, `$effect`, `$props`. No `$:` legacy.
3. **`{@const}` must be inside a block tag** — `{#if}`, `{#each}`, etc. Not at element level.
4. **Never `onclick|stopPropagation`** — use `onclick={(e) => { e.stopPropagation(); ... }}`
5. **File writes**: Use Python bash for API `.ts` files. Use Edit tool for small targeted changes.
6. **Test Svelte blocks balance** before finishing: `{#if}/{/if}` and `{#each}/{/each}` must pair.
7. **Don't truncate files** — always complete functions with closing braces. Check last char is `}` or `;`.
8. Before any deploy: check no `{@const}` at element level and no `onclick|stopProp` patterns.

## Module isolation guide (for scoped sessions)
Work on **just the dialer** without touching anything else:
- `src/lib/components/Dialer.svelte`
- `src/lib/stores/twilio.ts`
- `src/routes/api/twilio/`
- `src/routes/api/calls/`
- `src/routes/(app)/dialer/`

Work on **just the public site** (safe, no auth/DB impact):
- `src/routes/+page.svelte` (landing)
- `src/routes/pricing/`, `/join/`, `/coaching/`, `/about/`, `/contact/`
- `src/routes/marketplace/`

Work on **just the SDR portal**:
- `src/routes/sdr/`
- `src/routes/api/portal/sdr/`
- `src/routes/api/rep-profile/`

Work on **just agency ops**:
- `src/routes/(app)/agency/`
- `src/routes/api/agency/`
- `src/routes/api/payouts/`

Work on **just design/CSS**:
- `src/app.css`
- Tailwind class updates in `.svelte` files
- No API or data changes needed

## Current status (as of June 2026)
- 52 tasks completed this session
- Core loop working: import leads → assign to campaign → SDR dials → logs outcome → client sees it → Ryan pays reps
- Verbal approval gate built (admin approves SDR before first dial)
- All three user views wired and routing correctly
- Public site has 8 pages with real copy and pricing
- Discord webhook fires on wins
- Real-time agency command center (Supabase realtime, not polling)
- 37 API files needed truncation fixes after a long edit session — all repaired

### 2026-07-04/05 session additions (quick wins + waves 1–3)
- Quick wins: per-source webhook field mapping (migration 0006 `lead_sources.field_mapping`), weighted forecast endpoint (`/api/deals/forecast`), agency coaching stats (`/api/agency/coaching-stats`), BYOC fixes incl. async `verifyTwilioSignature`
- Wave 1A: one-submit client onboarding (`POST /api/clients/onboard` + Quick Onboard modal on `/clients`) — client → project → campaign → call list → SDR assignments with rollback
- Wave 1B: weekly client digest email (`lib/server/clientDigest.ts`, `/api/cron/client-digest` Mon 13:00 UTC, migration 0007; client-reports skips digest-enabled clients)
- Wave 1C: agency dashboard accuracy — owner-scoped queries + real queue depth
- Wave 1D: infra hardening — `lib/server/db.ts` (`mustWrite`/`logWrite`), rate limit on `/api/webhook/[token]`, Sentry-optional `handleError` in `hooks.server.ts` (`@sentry/sveltekit` dep, `SENTRY_DSN` optional)
- Wave 2E: `client_id` filter on `/api/deals` + `/api/deals/forecast` + pipeline page
- Wave 2F: bulk contact actions (`POST /api/contacts/bulk` — tag / campaign / call list / DNC / soft-delete, owner-gated) + bulk UI on `/contacts`
- Wave 2G: phone number health (`/api/phone/health` — daily utilization + 7-day volume) surfaced on `/numbers`
- Wave 2H: multi-channel sequences (migration 0008 — per-step `channel` email/sms/call_task + `sms_body`; advance engine sends SMS with quiet hours + creates call tasks; builder UI)
- Wave 3I: public booking links (migration 0009 `booking_links`; `/api/booking/*`, public `/book/[slug]` page, `/booking-links` management page, sidebar link)
- Wave 3J: Gmail sync batching

## What's next (priority order)
1. Run `vercel deploy --prod` and verify build passes
2. Run SQL migrations in Supabase
3. Buy/install Miller Banner font into `/static/fonts/`
4. Migrate high-traffic pages to `+page.server.ts` load functions (contacts, dashboard, campaigns)
5. Add parallel dialing (Twilio multi-line) for volume scaling
6. Wire live Deepgram transcription during calls
