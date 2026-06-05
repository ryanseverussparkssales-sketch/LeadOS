# RogueOS — Credentials & Integration Status
**Last updated: 2026-05-30**

---

## ✅ WORKING — Credentials already in `.env.local`

| Service | Env Var | Used For |
|---------|---------|---------|
| Supabase | `PUBLIC_SUPABASE_URL` | Database, auth, storage |
| Supabase | `PUBLIC_SUPABASE_ANON_KEY` | Client-side queries |
| Supabase | `SUPABASE_SERVICE_KEY` | Server-side admin queries (bypasses RLS) |
| Twilio | `TWILIO_ACCOUNT_SID` | Outbound calls, webhooks |
| Twilio | `TWILIO_AUTH_TOKEN` | Twilio REST API auth |
| Twilio | `TWILIO_APP_SID` | Browser SDK voice token |
| Groq | `GROQ_API_KEY` | Whisper transcription |
| Anthropic | `ANTHROPIC_API_KEY` | Claude summaries, copy gen, AI scoring |
| ngrok | `NGROK_DOMAIN` | Local dev webhook tunnel (not needed in prod) |

---

## ⚠️ PARTIALLY WORKING — Webhook-only (no OAuth)

| Service | What Works | What's Missing | Where to Configure |
|---------|-----------|----------------|-------------------|
| **Slack** | POST messages via Incoming Webhook URL | Full OAuth, read messages, bot commands | Marketing → Integrations → Slack |
| **Microsoft Teams** | POST notifications via Incoming Webhook | Full OAuth, read channels | Marketing → Integrations → Teams |

**To activate Slack:**
1. Go to api.slack.com/apps → Create App → Incoming Webhooks
2. Enable and add to your workspace, copy the webhook URL
3. Paste into Marketing → Integrations → Slack → Webhook URL
4. Set default channel (e.g. `#sales-alerts`)

**To activate Teams:**
1. In Teams: open a channel → … → Connectors → Incoming Webhook → Configure
2. Copy the webhook URL
3. Paste into Marketing → Integrations → Teams

---

## 🔴 STUBS — UI exists, no backend implementation

### Settings → Connections

| Service | Status | What's Needed to Activate |
|---------|--------|--------------------------|
| **Gmail** | Button shows, clicks do nothing | Google OAuth2 credentials: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Register app at console.cloud.google.com → APIs & Services → Enable Gmail API |
| **Google Calendar** | Button shows, clicks do nothing | Same Google OAuth app as Gmail — enable Calendar API additionally |
| **Spotify** | Button shows, clicks do nothing | Spotify Developer App: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` at developer.spotify.com. Intended use: background music during dialing sessions |
| **2FA / Two-Factor Auth** | Links to Supabase dashboard | Supabase dashboard → Authentication → Settings → Enable MFA. Or implement TOTP client-side using `otplib` npm package |

### Financial Integrations (Stack Manager quick-add — no live data pull)

| Service | Status | What's Needed |
|---------|--------|--------------|
| **Plaid** | Listed as quick-add account only | `PLAID_CLIENT_ID` + `PLAID_SECRET` from dashboard.plaid.com. Needs Plaid Link frontend SDK + backend `/api/plaid/exchange-token` endpoint. Use for: auto-import bank transactions into Balance Tracker |
| **Stripe** | Listed in stack, no billing for RogueOS itself | Two separate things: (1) `STRIPE_SECRET_KEY` + `STRIPE_PUBLISHABLE_KEY` for billing customers for RogueOS subscriptions; (2) Same keys for collecting invoice payments. Register at dashboard.stripe.com |
| **Mercury** | Account tracker only, no API pull | Mercury API is invite-only (mercury.com/api). `MERCURY_API_KEY` from Mercury dashboard. Use for: auto-pull bank balance + transactions |
| **Wave** | Account tracker only | Wave API (developer.waveapps.com). OAuth-based. `WAVE_CLIENT_ID` + `WAVE_CLIENT_SECRET`. Use for: sync invoices to Wave accounting |
| **Anthropic billing** | Stack entry only | Anthropic does not have a public billing API as of 2026. Pull from Supabase `api_usage_log` table instead (already tracked per call) |
| **OpenAI billing** | Stack entry only | OpenAI usage API: `GET https://api.openai.com/v1/usage` with `OPENAI_API_KEY`. Returns token usage by day. Add endpoint `/api/financials/openai-usage` |
| **Vercel** | Stack entry only | `VERCEL_API_TOKEN` from vercel.com/account/tokens. Endpoint: `GET https://api.vercel.com/v2/deployments`. Use for: show latest deployment status, billing usage |
| **Cloudflare** | Stack entry only | `CLOUDFLARE_API_TOKEN` from dash.cloudflare.com/profile/api-tokens. Use for: pull DNS, bandwidth usage |
| **DocuSign** | Stack entry only | DocuSign Developer account → Integration Key + Secret. OAuth2 flow needed. `DOCUSIGN_INTEGRATION_KEY` + `DOCUSIGN_SECRET_KEY`. Use for: send contracts for e-signature, attach signed docs to invoices |
| **Smart Martins** | Stack entry only | Unknown service — add credentials manually in Stack Manager |
| **Notion** | Listed in Settings Integrations | Notion OAuth app at notion.so/my-integrations. `NOTION_CLIENT_ID` + `NOTION_CLIENT_SECRET`. Use for: sync notes/docs to Notion workspace |
| **Bannerbear** | Link to website only | `BANNERBEAR_API_KEY` from bannerbear.com/app/api-keys. Add to API Key Vault, then build `/api/marketing/bannerbear-generate` endpoint to auto-generate images from templates |
| **Canva Partner API** | Open-in-Canva links only | Canva Partner API requires approval at canva.com/developers. Free link-based integration already works for opening designs. Full API adds: create design from template, export assets |

---

## 🔑 REQUIRED ENV VARS TO ADD (for stub activation)

Add these to `.env.local` as you set up each service:

```bash
# Google (Gmail + Calendar)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Spotify
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=

# Stripe (billing for RogueOS + invoice collection)
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# Plaid (bank connection)
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=sandbox   # sandbox | development | production

# Mercury (banking API — invite only)
MERCURY_API_KEY=

# Vercel (deployment + billing)
VERCEL_API_TOKEN=

# Cloudflare
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ACCOUNT_ID=

# DocuSign
DOCUSIGN_INTEGRATION_KEY=
DOCUSIGN_SECRET_KEY=
DOCUSIGN_BASE_URL=   # https://demo.docusign.net/restapi (sandbox) or https://na3.docusign.net/restapi

# Notion
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=

# Bannerbear
BANNERBEAR_API_KEY=

# OpenAI (optional — if adding DALL-E image generation or usage pull)
OPENAI_API_KEY=

# Wave (accounting)
WAVE_CLIENT_ID=
WAVE_CLIENT_SECRET=
```

---

## 🔒 SECURITY NOTES ON CREDENTIALS

1. **Never commit `.env.local` to git.** Verify `.gitignore` includes `.env.local`.
2. **`SUPABASE_SERVICE_KEY` bypasses all RLS.** Only ever use it server-side (`$env/static/private`). Never in any `+page.svelte`, `+page.ts`, or client-side code.
3. **`password_vault` and `api_key_vault`** currently store values as text. Before going live, implement AES-256 encryption: encrypt in the server route before INSERT, decrypt in the GET route. Use `VAULT_ENCRYPTION_KEY` env var (32-byte secret) with Node's `crypto.createCipheriv`.
4. **Twilio Auth Token** — rotate this token quarterly. Store the current token in `.env.local` only.
5. **Stripe Secret Key** — use restricted keys (read-only for lookup, write-only for charge creation) rather than the master secret key.

---

## ACTIVATION PRIORITY ORDER

Build integrations in this order for maximum ROI:

1. **Stripe** — Needed before any customer can pay. ~2 days.
2. **Gmail OAuth** — Most requested by sales users. ~3 days.
3. **Plaid** — Auto-populates Balance Tracker; removes manual weekly input. ~3 days.
4. **DocuSign** — Close deals + invoice in same flow. ~3 days.
5. **Vercel billing API** — 2 hours. Just a GET request.
6. **Notion** — Good for users who already use Notion for notes. ~2 days.
7. **OpenAI usage** — 2 hours. Adds cost tracking to Financials.
8. **Canva Partner API** — Only if you want automated asset creation. Requires approval.
9. **Bannerbear** — Only if scaling client content creation. ~1 day.
10. **Mercury** — Invite-only, lower priority until accepted.
