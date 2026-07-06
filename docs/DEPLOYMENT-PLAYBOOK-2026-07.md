# Deployment Playbook — Everything Shipped This Session

Covers both repos: **RogueOS** (leadosuite-mvp → Vercel) and **Guppy** (local engine on your PC).
Do the RogueOS section first; the Guppy section only matters for local-engine + CRM-bridge features
and can lag. Each step is tagged **[you]** (terminal / secrets — must be you) or **[Claude-able]**
(a browser step I can drive via the Chrome extension if it's connected and you're logged in).

Legend: ⚠ = don't skip / risk if wrong. ⏱ ≈ rough time.

---

## 0. What changed since last deploy (so you know what you're shipping)

- **5 new DB migrations**: `0006_lead_source_field_mapping`, `0007_client_digest`,
  `0008_sequence_channels`, `0009_booking_links`, `0010_phone_number_health`.
- **New features**: webhook field-mapping + Meta lead-ads, client digest email, agency dashboard
  accuracy, write-error logging + rate limiting + optional Sentry, pipeline client filter, bulk
  contact actions, phone number health, multi-channel cadences, public booking links, batched Gmail
  sync, sequence step editing, the hybrid `/assistant` (cloud + local), CRM MCP server + `ldo_`
  tokens, and the design-polish waves.
- **New deps**: `@playwright/test`, `@sentry/sveltekit`, `zod`, `sveltekit-superforms`.
- **New cron**: `/api/cron/client-digest` (Mon 13:00 UTC) — verify it's in `vercel.json`.
- **New optional env**: `SENTRY_DSN`, `PUBLIC_GUPPY_URL`. Everything else was already in your env.

---

## 1. RogueOS — pre-flight (local, ~10 min) **[you]**

```powershell
cd "C:\Users\Ryan\Lead Os\LeadOS\leadosuite-mvp"
git status                 # review the session's changes
npm install                # picks up zod, superforms, @playwright/test, @sentry/sveltekit
npm run build              # ⚠ MUST pass locally before deploy — this is your safety net on all agent edits
```
If the build fails, it'll be a type/import error in one of the touched files — paste it to me and
I'll fix it. Do **not** deploy on a red build.

Optional but recommended the first time:
```powershell
npx playwright install chromium
npm run test:e2e           # smoke (needs the app running or E2E_BASE_URL); ok to skip on first ship
```

---

## 2. RogueOS — database migrations (Supabase, ~5 min) ⚠ **[Claude-able or you]**

Run **in order**, one at a time, in the Supabase SQL Editor (Dashboard → SQL Editor → New query),
pasting each file's contents:

1. `supabase/migrations/0006_lead_source_field_mapping.sql`
2. `supabase/migrations/0007_client_digest.sql`
3. `supabase/migrations/0008_sequence_channels.sql`
4. `supabase/migrations/0009_booking_links.sql`
5. `supabase/migrations/0010_phone_number_health.sql`

All are idempotent (`IF NOT EXISTS`), so re-running is safe. ⚠ This is your **production database** —
if you've never applied 0006–0010, apply all five; if some already ran, the `IF NOT EXISTS` guards
make the rest no-ops.

> **I can drive this** via the Chrome extension: navigate to your Supabase SQL editor (you logged in),
> paste each migration, and run it while you watch — one at a time, confirming each. Say the word and
> make sure Chrome + the extension are connected.

Then enable **Realtime** on these tables (Database → Replication): `voicemails`, `missed_calls`,
`contacts`, `tasks`. **[Claude-able]** (toggles) or [you].

---

## 3. RogueOS — environment variables (Vercel, ~5 min) ⚠ **[you — secrets]**

Vercel → Project `lead-os` → Settings → Environment Variables (Production). Confirm the full set is
present; add anything missing. **Load-bearing** (app breaks/features silently dead without them):

```
PUBLIC_SUPABASE_URL              SUPABASE_SERVICE_KEY
PUBLIC_SUPABASE_ANON_KEY         CRON_SECRET
TWILIO_ACCOUNT_SID               TWILIO_AUTH_TOKEN
TWILIO_API_KEY_SID               TWILIO_API_KEY_SECRET
TWILIO_PHONE_NUMBER              TWILIO_APP_SID
STRIPE_SECRET_KEY                STRIPE_WEBHOOK_SECRET
RESEND_API_KEY                   RESEND_WEBHOOK_SECRET   ⚠ inbound email now FAILS CLOSED without this
ANTHROPIC_API_KEY                GROQ_API_KEY
VAULT_ENCRYPTION_KEY             PUBLIC_SITE_URL
```
**New / optional this session:**
```
SENTRY_DSN        (optional — turns on error reporting; app runs fine without it)
PUBLIC_GUPPY_URL  (optional — defaults to http://127.0.0.1:8080; only if your local engine uses a different port)
```
⚠ I recommend **you** enter secrets yourself. I can pre-fill non-secret ones via the browser, but I
shouldn't be the one handling your keys.

Sanity: `TWILIO_SKIP_SIGNATURE_CHECK` should be **unset** (it's now ignored in prod anyway, but keep
it clean).

---

## 4. RogueOS — deploy (~5 min) **[you]**

```powershell
cd "C:\Users\Ryan\Lead Os\LeadOS\leadosuite-mvp"
git add -A && git commit -m "Session: features + assistant + design polish"
git push origin main
vercel deploy --prod        # or let the git push auto-deploy
```

---

## 5. RogueOS — post-deploy wiring (~10 min) **[Claude-able or you]**

- **Webhooks** point at the prod domain (Twilio Console → Voice/Status/Recording/Incoming;
  Stripe → webhook endpoint; Resend → inbound). **[Claude-able]** browser form edits.
- **Supabase Auth** URL config: Site URL + redirect allow-list include the prod domain.
- **Vercel cron**: confirm `/api/cron/client-digest` shows under Project → Cron Jobs.
- **Mint an `ldo_` API token**: in the app, Settings → API Tokens → create with scopes
  `read, write`. Copy it once — you need it for the Guppy bridge (§7).

---

## 6. RogueOS — smoke test (~10 min) **[you, I can help verify]**

Log in → dashboard hero band renders → import 5 contacts → dial one → log outcome → it appears in the
client portal → open `/assistant`, send "what's my pipeline this month" (cloud mode, Claude answers +
uses the tool) → open `/booking-links`, create a link, load `/book/<slug>` in an incognito tab and
book a slot → check the confirmation email + ICS arrive. Watch Vercel Function logs for 500s.

---

## 7. Guppy — local engine + CRM bridge (~10 min, whenever) **[you]**

On your PC, set env for the Guppy FastAPI process (its `.env` / launch env):
```
GUPPY_ALLOWED_ORIGINS=https://<your-vercel-domain>     # lets the deployed assistant reach localhost
LEADOS_MCP_URL=https://<your-vercel-domain>/api/mcp    # CRM bridge (briefing, nudges, CRM tab)
LEADOS_TOKEN=ldo_<the token from §5>
GUPPY_LEADOS_BRIEFING_HOUR=8                            # optional, default 8
```
Restart the Guppy API (`bin/restart_api_only.ps1` keeps models warm). Verify:
`python -m py_compile src/guppy/api/routes_surface.py` (5-sec sanity on this session's edits), then
open the app: the Workspace CRM tab should show a "RogueOS · live" badge, and tomorrow at 8am the
Companion should speak the morning briefing.

Back in RogueOS `/assistant`, the engine badge should now flip to **"Local engine · Hermes 36B"** when
Guppy is running (browser calls `localhost` directly — no tunnel).

---

## 8. Rollback

- **Vercel**: Deployments → previous deployment → Promote to Production (instant).
- **Migrations**: all additive (`ADD COLUMN`/`CREATE TABLE IF NOT EXISTS`) — nothing dropped, so a
  code rollback is safe without a DB rollback. New columns/tables just sit unused.
- **Sentry / local engine / bridge**: all env-gated — unset the env var to disable, no redeploy of
  logic needed.

---

## What I can do through screen/browser control vs what's yours

**Yours (I can't):** anything in a terminal — `npm install`, `npm run build`, `vercel deploy`,
`git push`, the Guppy restart. Computer-use grants terminals at a *click-only* tier (typing is
blocked), and my sandbox shell is a separate Linux box, not your Windows machine. Secrets/keys are
also better entered by you.

**I can drive (if the Chrome extension is connected and you're logged in):**
- **Run the §2 migrations** in the Supabase SQL editor — paste + run each, one at a time, with you
  watching. This is the most useful one to hand me. ⚠ It's your prod DB, so I'll confirm each before
  running.
- Toggle Supabase **Realtime** tables.
- Update **Twilio / Stripe / Resend webhook URLs** and **Supabase Auth** redirect config (non-secret
  form fields).
- **Mint the `ldo_` token** inside the RogueOS app once it's deployed.

If you want me to take the browser steps: make sure the Claude Chrome extension is connected and
you're logged into Supabase/Vercel/Twilio in that browser, then tell me which steps to take and I'll
go one at a time.
