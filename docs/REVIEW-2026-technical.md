# LeadOS / Edelhaus — 2026 Technical Review

_Lens: technical / architecture. Grounded in the codebase (446 source files, 237 API
routes, 70 pages, 77 components) and a hands-on walkthrough of the live app
(lead-os-livid.vercel.app). Date: 2026-06-09._

Stack: SvelteKit 5 (runes) SPA + Supabase (Postgres/PostgREST) + Vercel serverless,
with a separately-deployed Node WebSocket "relay" server for voice AI. Anthropic
Claude + Groq Whisper for AI.

> **Verification note.** A subagent flagged the AI chat endpoint as "truncated /
> won't compile" and several model IDs as "hallucinated." Both were checked against
> the real files on the host and are **false** — artifacts of a stale sandbox mount
> and an older training cutoff. The chat endpoint is 504 lines, brace-balanced, and
> ships; `claude-sonnet-4-6` / `claude-haiku-4-5` are current 2026 models. Those
> claims are excluded below.

---

## Scorecard (technical lens)

| Dimension | Grade | One-line |
|---|---|---|
| Function completeness | A− | Exceptionally broad; breadth slightly outruns depth |
| Usability | B | Strong workflow patterns; some sparse/low-contrast surfaces |
| AI implementation | B | Wide coverage, one excellent piece (voice); blocking + no RAG + partial cost tracking |
| Scaling | C+ | Serverless fundamentals good; cron N+1 and code-only tenant isolation are the ceilings |
| Design | A− | Distinctive, consistent, above-average identity for a CRM |
| UI | B− | Polished shell, but impoverished data-viz and accessibility gaps |

---

## 1. Function completeness — A−

For an MVP this surface is remarkable: outbound dialer + power dialer + browser desk
phone, inbound call routing/voicemail, SMS inbox, Gmail OAuth + email inbox +
sequences, contacts/companies CRM, deal pipeline (kanban), campaigns, lead gen
scraper, an agency layer (clients, team, payouts, engagements, client portal),
financials (invoices, payroll, ACH), reports + analytics, marketing assets + social,
rep profiles/coaching/leaderboard, time tracking, automations, and a multi-tenant
super-admin/impersonation system. ~40 feature areas.

The honest risk is **breadth over depth**: several areas render thin in the live app
(analytics has no charts; many list pages are sparse). The product is wide enough that
no single workflow is yet "best in class." For a technical roadmap this argues for a
**depth pass on the 3–4 core loops** (dial→log→disposition, pipeline, analytics)
before adding more surface.

## 2. Usability — B

Strong, modern patterns: faceted left-rail filters with bulk actions and a dedup tool
(contacts), a customizable widget dashboard, inline AI assistant on the dashboard, a
weighted-forecast kanban, global search, and a Dial/Campaigns/Agency **mode switcher**
in the top nav. The mode switcher is powerful but adds an extra mental model — it's the
main navigation-complexity risk and worth usability-testing with a new rep.

Gaps: pages with little data look empty rather than guiding (few empty-states), and the
deep-data story is weak because most list endpoints cap results without true pagination
(see §4) — you physically can't page past the first N contacts/calls/emails.

## 3. AI implementation — B

**Coverage (≈26 endpoints):** Anthropic Claude across the board — `claude-haiku-4-5`
for high-volume tasks (summaries, scoring, drafts, the dashboard assistant), `sonnet-4-6`
for heavier generation, one `opus-4-6` vision call in the scraper; Groq `whisper-large-v3`
for call transcription. Tasks: call transcription + summary + quality scoring, an
agentic in-CRM assistant (14 scoped tools, tier-gated, rate-limited), email/SMS drafting,
script and report generation, screenshot→contact extraction, and live voice AI.

**The standout:** the voice relay (`relay-server/server.js`) is genuinely well-built —
token streaming to Twilio TTS, **barge-in/interrupt** handling, a `<<END outcome=…>>`
sentinel the model emits to end calls with a structured outcome, five practice personas,
and post-call coaching. This is the most sophisticated AI in the product.

**What's missing for 2026:**
- **No RAG / embeddings / semantic search anywhere.** Contact/knowledge search is all
  keyword `ilike`. The single biggest AI capability gap — semantic search over calls,
  emails, and contacts is table-stakes for a 2026 CRM.
- **Mostly blocking, not streamed to the client.** Only 2 endpoints stream; the flagship
  dashboard assistant does up to 5 sequential model round-trips + tool queries in one
  blocking request. Multi-second latency, no token streaming.
- **AI cost tracking is partial and estimated.** `api_usage_log` is written only for
  call recordings, using **hardcoded token counts** (≈150 in / 100 out) — the analytics
  "API Cost Breakdown" you see live is therefore an estimate, and the ~25 text/vision
  endpoints log nothing. No real per-tenant AI spend visibility.
- **Model strings are scattered** across ~26 call sites with no central constant. Mostly
  current, but centralize them in `lib/server/models.ts` and verify the lone
  `claude-opus-4-6` (current Opus is 4.8) — a wrong string fails only at runtime.
- **Two integration styles** (SDK vs raw `fetch`) do the same job inconsistently.

## 4. Scaling — C+

**Done right (better than typical MVP):**
- **Durable serverless background work** — `lib/server/durable.ts` uses Vercel
  `waitUntil` with an `await` fallback so webhook follow-up (transcription, etc.) isn't
  killed after the response. Correct fix for the classic serverless data-loss bug.
- **DB-backed rate limiting** (now that `increment_rate_limit` is migrated) — serverless-correct, shared across instances.
- Module-level Supabase singletons; lean dependency tree (~6 runtime deps); all DB
  access via PostgREST HTTP, so **no raw PG connection-pool exhaustion** under fan-out.

**The two ceilings to fix before scaling:**
1. **Cron jobs are serial N+1 fan-outs in one invocation.** `gmail/sync` (every 5 min)
   loops each account → each message → ~5 sequential DB queries; at, say, 50 accounts ×
   20 messages that's thousands of serial round-trips per run and will hit the Vercel
   function timeout well before 10×. `client-reports` and `sequences/advance` have the
   same O(n) nested-loop shape. Fix: batch with `IN (…)` lookups or move to a queue/worker.
2. **Multi-tenancy is enforced in app code, not the database.** Every query uses
   `supabaseAdmin` (service role, **bypasses RLS**) scoped by a manual `.eq('user_id', …)`.
   The 88 RLS policies in the schema are effectively dead weight at runtime. Any endpoint
   that forgets the scope filter is a silent cross-tenant breach with **no DB backstop** —
   the same class as the IDOR bugs already found and fixed this cycle. Defensible for an
   MVP, but it's the single biggest structural risk for a multi-tenant CRM. Longer-term:
   move reads to the user-JWT client so RLS becomes a real second layer.

**Medium:** list endpoints (`calls`, `emails`) cap but don't `.range()`-paginate — deep
data is unreachable; almost no HTTP/edge caching (only a 10s client-side cache); some
`select('*')` with nested joins pull more than needed.

## 5. Design — A−

Genuinely distinctive for a CRM: a serif display face ("EDELHAUS", "Good evening")
over a near-black UI with restrained accent colors, consistent KPI-card and panel
language across every page, and thoughtful touches (a Spotify now-playing widget, win
celebrations). It reads as a designed product, not a Bootstrap admin template. This is a
real asset and a differentiator.

## 6. UI — B−

The shell is polished, but two issues recur on every page:
- **Accessibility / contrast.** The dim, tiny uppercase micro-labels (gray on black —
  "WIDGET BAND", "TOTAL PIPELINE", filter headers) fail WCAG AA contrast and are hard to
  scan. Easiest high-impact win: lift label contrast one or two steps.
- **Impoverished data-viz.** The analytics page — where a 2026 sales tool should shine —
  is KPI cards plus a single progress bar, with **no time-series charts or trends**.
  Pipeline, calls, and revenue all want line/area/funnel charts over time. This is the
  biggest UI gap relative to category expectations.
- Lower-priority: low information density (lots of whitespace per row), and few
  empty-state affordances so sparse pages feel broken rather than new.

---

## Prioritized technical roadmap

**P0 — correctness & safety (mostly done this cycle)**
- ✅ Inbound/outbound calling, schema drift, IDOR/SSRF, missing RPCs — fixed.
- Add a DB backstop or a lint/CI check that every `supabaseAdmin` query is user-scoped.

**P1 — scaling ceilings**
1. Batch the cron N+1 loops (gmail sync first) or move to a queue/worker.
2. Real per-tenant AI cost logging (actual token usage from API responses, all endpoints).
3. True pagination on `calls` / `emails` / any unbounded list.

**P2 — AI depth (2026 competitiveness)**
4. Add embeddings + semantic search over calls/emails/contacts (pgvector in Supabase).
5. Stream the dashboard assistant's responses; centralize + verify model IDs.

**P3 — UI/UX depth**
6. Real charts on analytics (trends, funnel, revenue over time).
7. Contrast/accessibility pass on micro-labels; add empty-states.
8. Usability-test the Dial/Campaigns/Agency mode switcher with a new user.

**Bottom line:** LeadOS is a strikingly broad, well-branded product whose serverless
fundamentals are handled better than most MVPs. The gap to "2026-grade" is not features —
it's **depth**: semantic-search AI, real analytics charts, batched/queue-backed
background jobs, and turning the in-code tenant isolation into a defense-in-depth posture.
