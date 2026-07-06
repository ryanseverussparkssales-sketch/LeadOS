# RogueOS — CRM Completeness & Integration Review — 2026-07-04

Companion to LAUNCH-REVIEW-2026-07-04.md. Covers (1) security fixes applied today, (2) feature gaps vs competing CRMs, (3) extensibility for other phone providers and lead sources.

---

## 1. Security fixes applied this session

| Fix | File |
|---|---|
| Inbound email webhook now **fails closed in production** when `RESEND_WEBHOOK_SECRET` is unset (503 instead of processing forgeable email) | `src/routes/api/emails/inbound/+server.ts` |
| `TWILIO_SKIP_SIGNATURE_CHECK` is now **ignored in production** (logged as error) | `src/lib/server/twilioVerify.ts` |
| `api/deals` POST now verifies `contactId` and `clientId` belong to the caller before insert | `src/routes/api/deals/+server.ts` |
| (Earlier today) tenancy scoping on `templates/[id]` PATCH and `calls/[id]` PATCH secondary writes | see LAUNCH-REVIEW |

All items from the June audit backlog are now closed except the observability item (silent supabase error discards, M6) — that remains post-launch backlog.

---

## 2. Completeness vs competing CRMs (Close, GoHighLevel, Pipedrive, HubSpot Sales)

### Differentiators competitors DON'T have — lean into these
- Agency command center with per-SDR realtime stats
- **Real Stripe Connect rep payouts** (approve win → money moves)
- Branded client portal with script approvals + invoices
- SDR marketplace / interview scoring / verbal-approval gate
- AI pre-call brief, call scoring, AI script generation

### Gap table (graded for the target buyer: SDR agencies + small outbound teams)

| Category | RogueOS today | Gap vs competitors | Severity | Effort |
|---|---|---|---|---|
| Contacts/companies | Custom fields, dedup, merge, timeline | Solid — near parity | — | — |
| Calling | Power dialer, VM drop, recording, local presence, AMD | No **parallel dialing**, no inbound IVR | Med | L |
| Call transcription | Schema field exists, Groq wired for voicemail only | Auto-transcribe all calls | **High (quick win)** | S |
| Call coaching | `call_feedback` table exists, no UI | Coaching dashboard | Med (quick win) | S |
| Email | Send, sequences, templates, inbound via Resend | No **2-way Gmail/Outlook sync**, no open/click tracking surfaced per-sequence | **High** | M–L |
| Multi-channel cadences | Email sequences only | No call+SMS+email steps in one cadence | High | M |
| Pipeline | Single pipeline, drag-drop, probability | No **multiple pipelines** (agencies run one per client) | **High** | M |
| Forecasting | None | Weighted forecast rollup ("expected revenue this Q", per-rep) | High (quick win — one aggregation endpoint) | S |
| Meeting booking | Modal + ICS email | No **public booking link** (Calendly-style) — table stakes | **High** | M |
| Automation | Triggers + sequences + routing rules | No generic if/then builder, no outbound webhooks | Med | M |
| Reporting | Activity, win/loss, leaderboard | No custom report builder | Low for segment | L |
| Bulk actions | Import-time bulk assign | No "select 500 → tag/assign/sequence" in list views | Med | S–M |
| Mobile | PWA meta only | Competitors have apps; PWA polish is acceptable | Low–Med | M |
| Public API | Session-cookie auth only (+ webhook token) | No API-key REST API, no outbound webhooks | Med (blocks integrations) | M |

### Build-next priority (highest ROI for the market)
1. **Auto-transcription of all calls** — field exists, Groq wired; days of work, big demo value.
2. **Forecast rollup endpoint + dashboard card** — single aggregation query.
3. **Public booking links** — table stakes; every competitor has it; agencies lose appointments without it.
4. **Multiple pipelines** (per-client) — direct fit for the agency model.
5. **Multi-channel cadences** — add call-task and SMS steps to the existing sequence engine.
6. **Gmail 2-way sync** — OAuth stub already in Settings→Connections; completes the email story.
7. **Coaching dashboard** — table exists; pairs with transcription for AI coaching upsell.
8. **Bulk actions in contact/list views.**
9. **API keys + outbound webhooks** — unlocks Zapier "triggers" (not just actions) and partner integrations.
10. **Parallel dialing** — already on the roadmap; biggest dialer differentiator at scale.

---

## 3. Phone provider extensibility — verdict: tightly coupled, plan the adapter now

Twilio is inlined across 8 areas with **no abstraction layer**:

| Area | State |
|---|---|
| Browser Voice SDK (`Dialer.svelte`, `stores/twilio.ts`) | Twilio-proprietary SDK — hardest piece to swap |
| Server creds (`getTwilioCreds()`) | Already per-tenant BYOC-capable ✓ |
| Number provisioning (`api/phone/provision`) | **Hard-coded to master env account** — ignores tenant BYOC creds |
| SMS send | Uses `getTwilioCreds()` ✓ |
| Webhooks (voice/status/recording/incoming) | TwiML-specific |
| relay-server (AI calls) | Twilio ConversationRelay only |
| Token issuance / recording proxy | Per-account ✓ / intentionally master ✓ |

**Recommendation:**
- **Short term (days):** fix `api/phone/provision` to honor tenant BYOC creds — that plus dialing/SMS makes "bring your own Twilio account" a complete, sellable story without any adapter work.
- **Medium term (6–8 weeks):** introduce a `TelephonyProvider` interface (token, dial, provisionNumber, sendSms, parseWebhook, normalizeStatus) and move Twilio behind it. Telnyx/SignalWire have near-equivalent WebRTC SDKs; Vonage differs more. Do this **before** writing more call features — every new inline Twilio call raises the cost.
- relay-server stays Twilio-only until a second provider ships ConversationRelay-equivalent streaming; acceptable, it's an optional feature.

---

## 4. Lead source extensibility — verdict: strong foundation, small gaps

**Already built (better than expected):**
- **Public token-authenticated webhook** `api/webhook/[token]` — Zapier-compatible today, with dedupe + routing-rule execution on ingest
- Lead source CRUD + **routing rules**: auto-assign to campaign/SDR pool, tagging, contact-type override
- CSV import with custom-field creation and mapping
- AI scraper (URL extraction, Google Places, profile scraping)

**Missing (each ~1–3 weeks):**
1. **Per-source payload field mapping** — webhook currently expects its own payload shape; add a stored JSON-path mapping per source so arbitrary payloads (Meta, forms, Zapier) map to contact fields without code.
2. **Meta Lead Ads native integration** — Graph API subscription + page-token storage; highest-volume lead source for this market.
3. **Zapier app listing** — the endpoint already works; needs docs, a "Copy webhook URL" UI (exists partially), and a published Zapier integration.
4. **Source attribution reporting** — leads carry a source; surface conversion-by-source in analytics.

**Minimal plan to accept Zapier + Meta + generic webhooks:** ship #1 (field mapping) first — it makes the existing webhook universal; then #3 is docs, and #2 becomes a thin wrapper that POSTs into the same pipeline.
