# End-to-end tests (Playwright)

Browser E2E for RogueOS, isolated from the vitest unit suite. Specs live here
under `tests/e2e/` and use the **`*.e2e.ts`** suffix so the vitest glob
(`tests/**/*.{test,spec}.ts`) never picks them up. Do not rename them to
`*.spec.ts` — the two runners would collide.

## One-time setup

Install the Chromium browser binary (Playwright ships none by default):

```bash
npm install                    # pulls in @playwright/test (already a devDep)
npx playwright install chromium
```

## Running

```bash
npm run test:e2e         # headless, all projects
npm run test:e2e:ui      # interactive Playwright UI mode
npx playwright test --headed          # watch it drive a real browser
npx playwright test tests/e2e/smoke.e2e.ts   # a single file
npx playwright show-report            # open the last HTML report
```

By default the config starts the app itself (`npm run dev` on
`http://localhost:5173`) and reuses an already-running dev server if one is up.

## Environment variables

| Variable        | Required?             | Purpose |
| --------------- | --------------------- | ------- |
| `E2E_BASE_URL`  | optional              | Target base URL. Defaults to `http://localhost:5173`. Set it to a deployed preview (e.g. the Vercel URL) to run against that instead of a local dev server — the local `webServer` is reused-if-present, so pointing at a remote URL skips the local boot. |
| `E2E_EMAIL`     | for authenticated specs | Email of a real Supabase user to log in as. |
| `E2E_PASSWORD`  | for authenticated specs | That user's password. |

`.env` is **not** auto-loaded by Playwright — export these in your shell (or CI
secrets) before running:

```bash
# PowerShell
$env:E2E_EMAIL="you@example.com"; $env:E2E_PASSWORD="…"; npm run test:e2e

# bash
E2E_EMAIL=you@example.com E2E_PASSWORD=… npm run test:e2e
```

## Auth model

`auth.setup.ts` is a Playwright **setup project**: it logs in through the real
UI once and saves the browser session to `tests/e2e/.auth/user.json`. The
`chromium` project declares `dependencies: ['setup']`, so authenticated specs
reuse that session instead of logging in per-test.

- If `E2E_EMAIL` / `E2E_PASSWORD` are **absent**, the setup step **skips
  gracefully** and never writes `.auth/user.json`.
- Specs that need a session guard themselves with
  `test.skip(!existsSync(authFile), …)`, so the suite stays green without creds.

`tests/e2e/.auth/` is git-ignored — never commit a real session.

## What's covered

| File               | Auth needed | Covers |
| ------------------ | ----------- | ------ |
| `smoke.e2e.ts`     | no          | Public landing page loads + exposes a login form; `/assistant` redirects a logged-out visitor away (auth gate). |
| `assistant.e2e.ts` | yes*        | Assistant shell renders (header, composer, engine badge). A **mocked-SSE** turn: `page.route` intercepts `POST /api/assistant/stream`, returns a canned `source → tokens → [DONE]` body, and asserts the streamed text `Hello world` renders and the `via cloud:test` source line appears — proving the SSE parser + UI with no real backend or Anthropic key. The local Guppy `/health` probe is aborted so the engine deterministically stays in **cloud** mode. |

\* `assistant.e2e.ts` skips entirely without a saved auth session, because
`(app)` routes require login. The mocked-SSE assertion itself needs no backend —
only a logged-in session to reach the page.

## Notes

- The engine (`src/lib/assistant/engine.ts`) probes a **local** Guppy runtime at
  `http://127.0.0.1:8080/health` (cross-origin). In CI that host isn't present,
  so the probe naturally fails and the engine falls back to cloud — the specs
  additionally `page.route(...).abort()` it to make that deterministic.
- Trace is captured `on-first-retry`; screenshots `only-on-failure`. Open a
  failing run's artifacts with `npx playwright show-report`.
