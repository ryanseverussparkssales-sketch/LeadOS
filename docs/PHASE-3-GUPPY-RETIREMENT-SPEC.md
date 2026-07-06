# Phase 3 — Retire Guppy's Frontend, Keep the Engine

The payoff of the merge: RogueOS is now the single UI and system of record, and the hybrid
`/assistant` reaches the local engine over HTTP. So Guppy's React SPA is redundant. Phase 3 turns
Guppy from a full app into a **headless local engine** — the "Rogue Local Engine" — that boots with
the tray, serves its FastAPI on `localhost:8080`, and is driven entirely by RogueOS.

**Guiding principle: delete the frontend, preserve every backend capability.** Nothing about the
llama.cpp stack, voice, tools, memory, screen awareness, or the MCP/CRM bridge changes. We stop
building and shipping `web/`.

---

## What stays vs goes

**Stays (the crown jewels — all already HTTP-served):**
- llama.cpp routing / watchdog / fallback / KV-warm (ports 8086/8091/8092)
- `chat_engine/` two-pass tool loop; `/chat`, `/chat/stream`, `/chat/voice`
- Voice: TTS/STT/wake-word (`/companion/voice/*`)
- Tool executor, MCP plugin manager, screen awareness, memory, background loop
- `integrations/leados.py` (CRM bridge, morning briefing/nudges) — already headless
- Auth (`/auth/local`, JWT), health, CORS (`GUPPY_ALLOWED_ORIGINS`)
- Tray app (`tray_app.py`) and model management

**Goes (or is archived):**
- `web/` — the entire React SPA (three surfaces, 15 panels, build tooling)
- `launcher_app.py`'s "open a browser to the bundled React UI" behavior
- Frontend build/test steps in dev-workflow and packaging
- Any route that exists *only* to serve the SPA's own panels and has no non-UI consumer

---

## Migration in reversible steps (each shippable, each with a rollback)

### Step 0 — Prove parity (gate, no deletion)
Before removing anything, confirm RogueOS `/assistant` (local mode) covers the daily-driver uses of
Guppy's Companion/Workspace chat: streaming chat, tool calls, voice in/out, CRM actions, morning
briefing. Run against the live local engine for a few days. **Do not proceed until this is real.**
Keep a short checklist of "things I actually used Guppy's UI for" and verify each has a home in
RogueOS or is intentionally dropped.

### Step 1 — Flip the launcher to headless (fast, fully reversible)
- `launcher_app.py`: stop opening the bundled React UI. Two options (pick one):
  - **Headless**: spawn the FastAPI server, show a minimal Qt status window ("Rogue Local Engine —
    running on :8080, N models warm") with Start/Stop/Logs, and a button "Open RogueOS" that
    launches the browser to the deployed (or local) RogueOS URL.
  - **Redirect**: open the browser straight to RogueOS `/assistant` instead of the local React app.
- `tray_app.py`: keep model management; change any "Open Guppy" menu item to "Open RogueOS".
- Env: ship `GUPPY_ALLOWED_ORIGINS` preset to the RogueOS origin so the browser bridge works out of
  the box. Add `LEADOS_MCP_URL` / `LEADOS_TOKEN` to the engine's env template.
- **Rollback:** one flag flips back to serving `web/`. Nothing deleted yet.

### Step 2 — Inventory route consumers (the safety audit)
Grep every FastAPI route and classify by consumer:
- **Keep**: consumed by RogueOS `/assistant`, the MCP bridge, the background loop, the tray, or
  external clients (Claude Desktop). (chat, voice, health, auth, tools, mcp, companion action.)
- **Frontend-only**: consumed *only* by `web/` React code and nothing else (e.g. surface-state
  panels, workspace-data CRUD that RogueOS now owns, codespace/triage UI endpoints, media/calendar/
  email panels that duplicate RogueOS).
Output a table. Frontend-only routes become deletion candidates in Step 4 — but verify each has zero
non-UI callers first (the `leados`/briefing paths and MCP are the ones that must survive).

### Step 3 — Stop building the frontend (the real retirement)
- Remove `web/` from the packaging/build (dev-workflow, any pyinstaller/electron spec, CI).
- Move `web/` to `docs/archive/deprecated-frontend/` (don't hard-delete in the same commit — archive,
  then delete in a follow-up once a release has shipped clean). Same pattern the repo already used
  for `compat_shims/launcher_ui/` and `merlin/`.
- Update `CLAUDE.md`: the "PRIMARY SURFACE: Web UI" topology becomes "PRIMARY SURFACE: RogueOS
  `/assistant`; local engine is headless FastAPI." Mark the three-surface architecture (Companion/
  Workspace/Codespace) as retired-in-favor-of-RogueOS.
- README + launch docs: "Guppy is now the Rogue Local Engine — a headless AI daemon. UI lives in
  RogueOS."

### Step 4 — Prune frontend-only backend (careful, last)
Delete the routes Step 2 proved are frontend-only with zero other consumers. Keep anything the MCP
bridge, briefing loop, tray, voice, or chat needs. This is optional cleanup — leaving a few unused
routes mounted is harmless; deleting the 15-panel React app is where the maintenance win is.

### Step 5 — Rename + re-badge (cosmetic, satisfying)
- Package/window/tray text: "Guppy" → "Rogue Local Engine" (or keep "Guppy" as the affectionate
  codename for the daemon — your call; the brand constant lives in one place either way).
- Tray icon states already reflect model health; relabel menus.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| A capability lived only in the React UI and gets lost | Step 0 parity checklist + Step 2 consumer audit before any deletion |
| Voice UX regresses (browser Web Speech ≠ Guppy's native TTS/wake) | Keep Guppy's `/companion/voice/*` serving; add a fast-follow so RogueOS `/assistant` streams Guppy TTS in local mode (spec'd but not built — this is the one genuine UX gap) |
| Screen-awareness / avatar features had no RogueOS equivalent | Decide per-feature: port to an `/assistant` panel, expose as a tool, or intentionally drop. Document the call. |
| Offline/no-RogueOS access to the engine | The headless status window (Step 1 option A) keeps a minimal local control surface; the engine still answers via API for scripts/Claude Desktop |
| Packaging breaks when `web/` leaves the build | Archive-then-delete across two releases; keep a rollback flag through Step 3 |

---

## The one real UX gap to close alongside

Browser-native voice (Web Speech + `speechSynthesis`) shipped in Wave B is fine but not Guppy's
quality. Before fully retiring the Companion, add a **local-mode TTS path**: RogueOS `/assistant`,
when on the local engine, streams reply text to Guppy's TTS endpoint and plays the audio — reusing
Guppy's Kokoro/ElevenLabs pipeline. Small, additive, and it removes the last reason to open the old
Companion. (Roughly: a `speakViaEngine(text)` in `engine.ts` that POSTs to `${GUPPY_URL}/companion/
voice/...` and plays the returned audio; gated to local mode.)

---

## Effort & sequencing

- **Step 0 (parity):** days of real use, not coding. Gate everything on it.
- **Step 1 (headless launcher):** ~half a day, Guppy-side Python only, fully reversible.
- **Step 2 (audit):** a few hours, one agent, produces the deletion table.
- **Step 3 (stop building web/):** ~half a day + archive move.
- **Step 4 (prune routes):** optional, size depends on the audit.
- **Local-mode TTS fast-follow:** ~a day, RogueOS `engine.ts` + a Guppy voice endpoint check.

Net: about a week of light work spread over a couple of real-use weeks, most of it deletion and
config. The heavy lifting already happened in Phases 1–2 — Phase 3 is mostly the courage to remove
the second UI now that it's redundant.

## Open decisions for Ryan
1. **Keep a minimal local status window, or go browser-only** (open RogueOS and nothing else)?
2. **Codename:** retire "Guppy" for "Rogue Local Engine", or keep Guppy as the daemon's pet name?
3. **Screen-awareness / avatar / vision** — port to an `/assistant` panel, expose as tools, or drop?
4. **Do the local-mode TTS fast-follow before or after** archiving `web/`? (Recommend before — it's
   the last real reason to open the Companion.)
