# RogueOS `/assistant` — Local/Cloud Hybrid Companion (Phase 2 spec)

The merge that retires Guppy's standalone UI: a native Svelte assistant surface inside RogueOS
that uses the **local Guppy engine** (`localhost:8080`, GPU, voice) when reachable and falls back
to the **cloud** (Anthropic key already in RogueOS env) when it isn't. One dashboard, one design
language, intelligence that's better at home and still works on the road.

**Stack alignment (verified):** both apps are Svelte `5.55` / Kit `2.57` / Vite `8` — components and
patterns port cleanly. Guppy CORS is already env-driven (`GUPPY_ALLOWED_ORIGINS`), so allowing the
Vercel origin is one env var, no code change.

---

## Architecture

```
Browser (RogueOS on Vercel, or localhost during dev)
   │
   ├─ engine probe: GET http://127.0.0.1:8080/health   (200 → LOCAL, else CLOUD)
   │
   ├─ LOCAL  → POST http://127.0.0.1:8080/chat/stream        (Guppy: 36B, voice, tools, screen)
   │           Authorization: Bearer <guppy local token>
   │           SSE: data:{"token":"…"} … data:[DONE]
   │
   └─ CLOUD  → POST /api/assistant/stream   (RogueOS server route → Anthropic, SSE)
               reuses ANTHROPIC_API_KEY; CRM-tool-aware via the same MCP tool set
```

Key insight: the browser talks to `localhost` **directly** from the user's machine — Vercel is never
in the local path, so there's no tunnel to run. The RogueOS server route only handles the cloud
fallback. Guppy's local API and RogueOS's cloud route both speak the **same SSE token protocol**
(`data:{"token"}` / `[DONE]`), so the frontend has one stream parser.

### Why this is the real merge (not a rewrite)
- Guppy's value is its **backend** (llama.cpp routing/watchdog/fallback, TTS/STT/wake, tool executor,
  screen awareness) — all already HTTP-served, none of it needs the React SPA.
- RogueOS becomes the single UI + system of record. The assistant reaches CRM data through the MCP
  tools we already shipped (`/api/mcp`), so "add this lead", "what's my pipeline" work in both modes.
- End state (Phase 3): delete Guppy's React frontend; keep the Python daemon, renamed the "Rogue
  local engine," launched by the same tray app.

---

## Deliverables

### 1. Engine abstraction — `src/lib/assistant/engine.ts`
A small client that hides local-vs-cloud:
- `probeEngine(): Promise<'local' | 'cloud'>` — `fetch('http://127.0.0.1:8080/health', {signal: AbortSignal.timeout(1200)})`; cache result 30s; re-probe on demand and on local stream error.
- `streamChat(messages, { onToken, onSource, onToolChip, onDone, onError, signal })` — picks the endpoint by probe, POSTs, parses the shared SSE format, surfaces the answering engine (`local:hermes-36b` vs `cloud:claude`), tool-use chips, and terminal `[DONE]`. On a local failure mid-stream, emit a notice token and transparently retry once against cloud.
- Config via `PUBLIC_GUPPY_URL` (default `http://127.0.0.1:8080`) and an optional local bearer stored in RogueOS user settings (Guppy issues one via `/auth/local`).

### 2. Cloud fallback route — `src/routes/api/assistant/stream/+server.ts`
- `requireAuth` (session JWT or `ldo_` token — both already supported).
- Streams Anthropic (`claude-sonnet` for depth; `claude-haiku` for quick turns) as SSE in the **exact** `data:{"token"}` / `[DONE]` shape the local engine uses.
- System prompt injects the caller's CRM context; exposes the same tool set as the MCP server
  (search_contacts, log_call, create_task, pipeline_summary, …) via Anthropic tool-use, executing
  them through the existing route logic (owner-scoped). Prompt-cache the system block (already a
  pattern in Guppy).
- Rate-limited (reuse `rateLimit`).

### 3. Assistant surface — `src/routes/(app)/assistant/+page.svelte`
Native RogueOS page using the design system + the new `PageHeader`:
- **Header:** "Assistant" + a live engine badge — green "Local engine · Hermes 36B" when the probe
  hits localhost, grey "Cloud · Claude" otherwise, with a tooltip explaining the difference.
- **Chat transcript:** streamed tokens, markdown render, tool-use chips ("🔧 search_contacts…"),
  an "answered by" line per turn. Reuse the sentence-chunk + autoscroll patterns.
- **Composer:** textarea + send; Enter to send, Shift+Enter newline.
- **Voice (local-only):** when local, show a mic button that opens Guppy's voice session
  (`POST /companion/voice/session`) and streams TTS back; hidden in cloud mode with a subtle
  "voice needs the local engine" hint.
- **Quick actions:** chips that seed prompts wired to CRM tools — "Today's agenda", "Pipeline this
  month", "Draft follow-up for…", "Log my last call". These make the CRM connection obvious.
- **Degradation:** if neither engine answers, a clear inline error + retry, never a spinner-forever.

### 4. Nav + settings
- Sidebar: add "Assistant" (icon `sparkles`/`bot`) — likely top of the DIALING group or its own slot.
- Settings → a small "Local Engine" card: the `PUBLIC_GUPPY_URL`, a "Test connection" button
  (calls the probe), and where to paste the Guppy local token. Explains the hybrid in one paragraph.

### 5. Guppy side (one env change + doc)
- Set `GUPPY_ALLOWED_ORIGINS=https://<your-vercel-domain>` so the browser can call localhost from the
  deployed app. Document in Guppy's CLAUDE.md. No Guppy code changes for Phase 2.

---

## Execution plan (parallel-safe waves)

**Wave A (2 agents, disjoint files):**
- A1 — `engine.ts` + `api/assistant/stream/+server.ts` (the plumbing; testable with a fake stream).
- A2 — `assistant/+page.svelte` chat shell against a mock engine (transcript, composer, badges).

**Wave B (after A merges):**
- B1 — wire A2 to A1's real engine; add tool chips + answered-by; quick-action chips.
- B2 — voice (local-only) via Guppy's voice session; sidebar + settings card.

**Wave C — verification:** Playwright smoke (send a message in cloud mode, assert streamed reply),
`design:accessibility-review` on the page, block-balance/tenancy gates, docs.

**Effort:** ~a week. Nothing here risks existing surfaces — it's additive (one new route group, one
API route, one lib module). RogueOS stays fully functional throughout; Guppy is untouched but for an
env var.

---

## Tooling to add alongside (recommended)
- **Playwright** — first real E2E; covers this page and, later, auth/dialer/booking. Biggest gap-closer.
- **sveltekit-superforms + zod** — retrofit the assistant composer and future forms with typed validation.
- Use installed skills as gates: `design:design-system` to lock the shared tokens, `design:accessibility-review` before ship, `engineering:testing-strategy` for the Playwright plan.
- Hold **Storybook** until a real shared component library exists (post-Phase 3).

## Open decisions for Ryan
1. **Local token** — issue a long-lived Guppy local token stored in RogueOS settings, or have the
   browser hit Guppy's `/auth/local` on demand? (Latter is cleaner; needs Guppy reachable to start.)
2. **Cloud tool execution** — mirror all MCP tools into the Anthropic route now, or ship chat-only
   cloud fallback first and add tools in a fast-follow? (Chat-only is a day faster to a working page.)
3. **Voice in cloud mode** — leave local-only (recommended), or add a cloud TTS provider later?

---

## Shipped (Wave A + B)

The hybrid assistant is live. What now exists in the repo:

- **`src/lib/assistant/engine.ts`** — local-vs-cloud engine abstraction: `/health` probe (cached), shared SSE stream parser (`data:{"token"}` / `[DONE]`), answered-by source, tool chips, and transparent local→cloud retry.
- **`src/routes/api/assistant/stream/+server.ts`** — cloud fallback route: auth-gated, streams Anthropic in the shared SSE shape, CRM-tool-aware via the shared MCP tool registry, rate-limited, system-prompt cached.
- **Shared MCP tool registry** — `crmTools` extracted so the cloud route and the `/api/mcp` server expose the exact same owner-scoped tool set (search_contacts, log_call, create_task, pipeline_summary, …).
- **`src/routes/(app)/assistant/+page.svelte`** — native assistant surface: streamed transcript with markdown, engine badge, tool chips, answered-by line, quick-action chips, and browser voice (local-only) via Guppy's voice session.
- **Nav + settings** — sidebar "Assistant" entry (icon `sparkle`, top of DIALING; part of `dial` mode) and a Settings → Connections "Local AI Engine (Guppy)" card (local URL — restart to apply, optional local token read live, Test-connection `/health` probe). Legacy `/ai-assistant` now redirects to `/assistant`.

### Remaining
- **Wave C — verification:** Playwright smoke (send a message in cloud mode, assert streamed reply), `design:accessibility-review` on the page, sveltekit-superforms + zod retrofit of the composer.
- **Phase 3:** retire Guppy's React frontend; keep the Python daemon as the "Rogue local engine," launched by the same tray app.
