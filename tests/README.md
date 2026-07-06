# Money-path test suite (Workstream 4Q)

Vitest suites for the revenue-critical server logic: booking slot computation,
rate limiting, write-error observability, inbound lead webhooks, lead scoring,
reply routing, and the pipeline forecast rollup.

## Running

```bash
npx vitest run          # one-shot
npm run test:watch      # watch mode (package.json script)
```

No env vars, DB, or SvelteKit dev server needed — everything external is mocked.

## How it works

- `vitest.config.ts` is a standalone config (no SvelteKit plugin). It defines a
  `$lib` alias mirroring SvelteKit's, so server modules import cleanly AND
  `vi.mock('$lib/server/supabase', ...)` intercepts both `$lib/...` and
  relative `./supabase` imports (they resolve to the same module id).
- SvelteKit virtual modules are handled without stubs:
  - `./$types` imports in routes are type-only → erased at transpile time.
  - `$env/static/*` only appears inside `$lib/server/supabase`, which every
    suite replaces with `vi.mock` (the real module is never evaluated).
- `tests/helpers/supabaseMock.ts` is a chainable, awaitable Supabase client
  mock: queue `{ data, error }` results per table (FIFO), then assert on the
  recorded builder calls (e.g. the exact `insert` payload or `eq` filters).

## Coverage

| File | Target | What's covered |
|---|---|---|
| `slots.test.ts` | `src/routes/api/booking/_lib/slots.ts` | `zonedToUtc` (UTC/EST/EDT, spring-forward gap sanity, fall-back), `clampDays` bounds, `fetchBusyIntervals` (buffer padding, 30-min default duration, cancelled/no-show/invalid rows dropped, negative buffer), `computeSlots` (window generation in link-local time, 2h min-notice incl. exact boundary, buffer vs zero-buffer overlap exclusion, slot must end inside window, malformed windows ignored, overlap dedupe+sort, empty days omitted, DST-week unique local dates, owner-scoped query) |
| `rateLimit.test.ts` | `src/lib/server/rateLimit.ts` | Fixed-window `rateLimit()`: allows to limit / blocks over, `retryAfterSeconds` = ceil of window remainder (min 1), window reset after `windowMs` (fake timers), per-key isolation, 10k+ key spray never throws (eviction cap). DB-backed `rateLimitUser()`: under/over limit, fail-open on RPC error and on thrown client errors, `rate_limit_multiplier` override honored and sanitized |
| `db.test.ts` | `src/lib/server/db.ts` | `mustWrite` returns data / passes null / logs+throws with op name on error; `logWrite` returns the identical result object on success and error (logs only), works in `.then()` chains |
| `webhook.test.ts` | `src/routes/api/webhook/[token]/+server.ts` | Tested **through the exported POST handler** (the extraction helpers are module-private — see notes): 401 bad token, 429 + `Retry-After` header, limiter keyed `wh:{token}:{ip}`, `flattenFieldData` for both Meta shapes (top-level `field_data` and `entry[0].changes[0].value.field_data`), `getPath` dot-paths with numeric array indices via per-source `field_mapping` (mapping beats heuristics; missing path falls back), full name-extraction cascade (`name` > `full_name` > `first_name last_name` > `Unknown`, no stray spaces), phone-match dedupe → update with first-touch UTM preservation + `lead_metadata` merge, unknown-field metadata capture, real `initialContactScore` on insert, routing rules + outbound webhooks fired for creates only, 500 on failed insert (with `logWrite` observability) |
| `forecast.test.ts` | `src/routes/api/deals/forecast/+server.ts` | Tested **through the exported GET handler**: weighted/best/count math for pipeline, commit (≥ 75), thisMonth/nextMonth/thisQuarter/noCloseDate windows, byStage grouping, won actuals (month vs quarter), rounding + null value/probability tolerance, empty-pipeline zeros, owner scoping on both queries, valid `client_id` filter applied, malformed `client_id` ignored |
| `scoring.test.ts` | `src/lib/server/scoring.ts` | Base scores per `contact_type`, completeness bonuses, whitespace-only no-ops, source bonuses, 100 cap |
| `replyTag.test.ts` | `src/lib/server/replyTag.ts` | Encode/decode round trips, compact payloads, full-address + local-part decode, garbage/missing-uid/non-string-field rejection, `isReplyRoutingAddress` domain + case handling |

## Skipped / notes

- **Webhook extraction helpers are module-private.** `getPath`,
  `flattenFieldData`, and the name cascade in
  `src/routes/api/webhook/[token]/+server.ts` can't be imported directly, so
  they're covered through `POST` with supabase/rateLimit/webhooks/routingRules
  mocked (per the contract, replicate-and-verify was not acceptable).
  *Recommendation:* extract them to `src/routes/api/webhook/_lib/extract.ts`
  for direct unit testing — the route tests here will keep passing.
- **Dead branch found (not "fixed" by tests):** the webhook's
  `if (!name && !phone && !email) return 400` check is unreachable — `name`
  always falls back to the string `'Unknown'` first, so an empty payload
  creates an "Unknown" contact instead of 400ing. Tests assert the *actual*
  behavior (`name: 'Unknown'`). If 400-on-empty is desired, check
  `name === 'Unknown' && !phone && !email` (or move the fallback later).
- **Forecast bucket math is also module-private** (`bucket`/`add`/`round`), but
  it proved fully reachable through `GET` with the supabase mock, so nothing
  was skipped there.
- **Not covered:** `fetchBusyIntervals`'s supabase query horizon values (only
  presence asserted, not the exact ±4h pad), `getActiveLinkBySlug` (a trivial
  select wrapper), and anything requiring the real Supabase RPC
  (`increment_rate_limit`) or real Twilio/Stripe/Resend calls.
- **Timezone assumptions:** slot tests pin `America/New_York` + fake timers;
  forecast fixtures sit ≥ 2 days from month boundaries so host-TZ offsets
  (route uses local `new Date(y, m, 1)`) can't flip bucket membership.
