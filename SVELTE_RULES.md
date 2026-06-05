# SvelteKit Rules for RogueOS

## Runes (always use these, never legacy $:)
- `$state(value)` for reactive state
- `$derived(expr)` for computed values
- `$effect(() => {})` for side effects
- `$props()` for component props
- `$bindable()` for two-way bindable props

## SvelteKit conventions
- `{@const}` must be inside `{#if}`, `{#each}`, or `{#snippet}` — never at element level
- `onclick|stopPropagation` is invalid Svelte 5 — use `onclick={(e) => { e.stopPropagation(); handler(); }}`
- API routes in `src/routes/api/**/+server.ts`
- Server-only code in `src/lib/server/`
- `$lib` alias for imports from lib directory
- Form actions for mutations where possible
- `+page.server.ts` for data loading

## File write safety (learned the hard way)
- Always use Python bash writes for API server files, not the Write/Edit tools
- **Why:** The Write/Edit tools have a truncation bug on large .ts files — they silently cut off the end. Python bash `open(f,'w').write(content)` does not. Both write to the same underlying Windows filesystem (the Linux sandbox mounts it at `/sessions/.../mnt/`).
- **Rule:** `.svelte` files and small targeted edits → Edit tool is fine. Large `+server.ts` rewrites → Python bash only.
- Vercel builds from Windows FS — deploy from Windows terminal: `vercel deploy --prod`
- Local build fails due to EPERM on .svelte-kit — that's expected, use Vercel

## Testing requirements (before any task is "done")
- `npm run check` — svelte-check TypeScript diagnostics
- `npm run build` — production build (run on Vercel, not sandbox)
- `import.meta.env.SSR` for server-only conditional code

## Node.js production patterns
- Use connection pooling for database (Supabase handles this)
- Proper async error boundaries — never swallow errors silently in production paths
- Rate limiting on all mutation endpoints (already done for bulk ops)
- Use streaming responses for AI/LLM endpoints, never block waiting for completion
- `Response` streaming with `ReadableStream` for real-time AI output
- `crypto.subtle` for HMAC signatures (already used in email webhook verification)
- Structured logging: `console.error('[module] context:', err)` format
- Never `await` fire-and-forget operations — use `.catch(console.error)` pattern

## SvelteKit production patterns
- Server load functions > `apiFetch` in `onMount` for data that exists at page load
- `depends('app:namespace')` + `invalidate('app:namespace')` for revalidation
- Streaming promises in load functions for non-blocking slow data
- `use:enhance` on all forms for progressive enhancement
- `fail(400, { errors })` + Zod/Valibot for server-side form validation
- `{#each items as item (item.id)}` — always key expressions for performance
- `{#snippet}` for reusable template blocks within a component
- `$effect.pre` for DOM measurements before paint
- `transition:` / `in:` / `out:` for declarative animations
- Route groups `(group)` for layout organization without URL impact
- `+error.svelte` at route level for contextual error pages

## What "professional" means for RogueOS specifically
1. Pages load with data already present (SSR via +page.server.ts), no flash
2. Forms use actions + enhance, not raw fetch
3. Mutations invalidate the right data, not reload everything
4. AI endpoints stream, never block
5. Error states are explicit, not silent failures
6. TypeScript strict throughout, no `any` except where genuinely dynamic

---

# LeadOS Stack Patterns (merged from Skills Kit — reconciled June 2026)

Full reference: `docs/skills/LEADOSSTACK-SKILLS.md`. These are the **authoritative, codebase-adapted** versions. Where the kit conflicts with Svelte 5 or this repo's reality, the corrected rule below wins — see "⚠️ Corrections".

## Svelte 5 `$state` typing
- **Annotate the variable, never the rune:** `let x: T = $state(init)` — NOT `let x = $state<T>(init)` (that's the "Untyped function calls may not accept type arguments" error).
  - `let contacts: Contact[] = $state([]);` · `let currentCall: CallSession | null = $state(null);`
- Mutated DOM refs / vars must be `$state` too (fixes `non_reactive_update`): `let el: HTMLElement | null = $state(null);`
- Store + local copy: `let local: T = $state($store);` then sync with a **sync** `$effect(() => { store.set(local); });`.

## Accessibility (a11y)
- **Clickable thing → real element.** Prefer `<button type="button">`; for modals prefer native `<dialog>` (`dialogRef.showModal()`, Esc closes, focus managed, backdrop free).
- **If a div must be interactive (Pattern C):** add ALL of `role="button"` + `tabindex="0"` + `onkeydown` (Enter/Space → `preventDefault()` + action) + `aria-label`.
- **Labels:** preferred `for`/`id` (`<label for="x">…</label><input id="x">`); else wrap input in label; last resort `aria-label`. This is the #1 a11y offender (298 instances).
- Icon-only buttons need `aria-label`; `role="dialog"` divs need `tabindex`.

## Svelte 5 migration / deprecations
- **No `onclick|stopPropagation`** → `onclick={(e) => { e.stopPropagation(); handler(); }}` (same for `|preventDefault`).
- **`<svelte:component>` is deprecated in runes mode** → reference the component directly (`<Comp />`) or via registry: `const C = $derived(registry[key]); <C />`.

## Supabase typing (kills the `{ name: any }[]` plague — ~30 sites)
- Create `src/lib/types/database.ts`: base interfaces + join types + typed query-helper functions that `return data as T`. Never `any` in return types or props.
- **Adapt interfaces to the REAL schema** (`calls`, `call_list_contacts`, `scraped_contacts`, …). The kit's example uses illustrative tables (`call_logs`, `contacts.campaign_id`) that do NOT match this DB — generate from a prod dump (audit §3).

## ⚠️ Corrections — where the Skills Kit is WRONG for this stack (do NOT follow the kit here)
1. **Async `$effect` is an anti-pattern.** The kit shows `$effect(async () => { …; return cleanup; })`. In Svelte 5 the effect callback must be sync — an async callback's return is a Promise, not a teardown, and deps after the first `await` aren't tracked. **Keep `onMount(async () => {…})` for data loads.** For async + cleanup: `$effect(() => { const ac = new AbortController(); (async () => {…})(); return () => ac.abort(); });`. Do NOT migrate `onMount`→async `$effect`.
2. **Env vars:** kit uses `VITE_*` + `import.meta.env.VITE_…` and a client-side `twilio()`. This repo uses `$env/dynamic/private` (server) + `PUBLIC_*` (client); Twilio is server-only. Follow the repo.
3. **SSR / `+page.server.ts` loads:** kit assumes server loads. This app has `ssr = false` for `(app)` + `apiFetch` in `onMount`. Don't add server loads piecemeal (separate decision — audit §8).
4. **Kit a11y "Pattern A" example contains `onclick|stopPropagation`** in the inner button — contradicts the deprecation rule. Use the manual-handler form.
