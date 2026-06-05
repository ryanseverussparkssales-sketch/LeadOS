# LeadOS Stack Skills — Reference (codebase-reconciled)

Source: user's "Claude Code Skills & Reference Guide" (June 2026), originally at `/home/claude/LEADOSSTACK-*.md`.
This in-repo copy is **corrected for Svelte 5 and the actual leadosuite-mvp codebase**. Where the original kit
disagrees with reality, this file follows reality and notes it. Authoritative rules live in `../../SVELTE_RULES.md`.

> ⚠️ Corrections vs the original kit (read first):
> 1. **Do NOT use async `$effect`.** The kit's `$effect(async () => {…; return cleanup})` is wrong in Svelte 5
>    (returned value is a Promise, not teardown; post-`await` deps untracked). Use `onMount(async …)` for loads,
>    or `$effect(() => { (async()=>{…})(); return () => cleanup; })` for async + teardown.
> 2. **Env:** repo uses `$env/dynamic/private` + `PUBLIC_*`, NOT `VITE_*`. Twilio is server-only.
> 3. **SSR:** `(app)` has `ssr=false`; data via `apiFetch` in `onMount`. No `+page.server.ts` loads here.
> 4. **Schema:** adapt DB interfaces to real tables (`calls`, `call_list_contacts`, `scraped_contacts`, …),
>    not the kit's illustrative `call_logs`.

---

## 1. Svelte 5 `$state` typing

**Rule:** annotate the variable, never the rune.

```svelte
<script lang="ts">
  // GOOD — T resolved from the variable annotation
  let dialogOpen: boolean = $state(false);
  let selectedLead: Lead | null = $state(null);
  let contacts: Contact[] = $state([]);
  let currentCall: CallSession | null = $state(null);

  // BAD — "Untyped function calls may not accept type arguments"
  // let x = $state<string>("");
</script>
```

- DOM refs / vars that get mutated must be `$state` (fixes `non_reactive_update`):
  `let calendarEl: HTMLElement | null = $state(null);`
- Store + local copy (sync effect only): `let local: T = $state($store); $effect(() => store.set(local));`

**Checklist:** variable annotated? value matches type? not passing `<T>` to `$state()`? store synced via sync `$effect`? `lang="ts"` present?

---

## 2. Accessibility conventions

**Clickable elements**
- Pattern A (preferred): semantic `<button type="button" aria-label="…" onclick={…}>`.
- Pattern B (modals, best): native `<dialog bind:this={ref}>` + `ref.showModal()` / `ref.close()`. Free backdrop, focus trap, Esc.
- Pattern C (last resort, div must be interactive): `role="button"` + `tabindex="0"` + `onkeydown` (Enter/Space → `preventDefault()` + action) + `aria-label`.

**Labels** (the #1 offender — 298 instances)
- Preferred `for`/`id`: `<label for="dial-input">Phone</label><input id="dial-input" …>`
- Or wrap: `<label>Phone <input …></label>`
- Last resort: `aria-label="Phone"`.

> Note: the kit's Pattern A sample contains `onclick|stopPropagation` inside the inner button — ignore that; use
> `onclick={(e) => { e.stopPropagation(); … }}`.

---

## 3. Supabase typing (eliminate `{ name: any }[]`)

Create `src/lib/types/database.ts` as the single source of truth — base interfaces + join types + typed helpers.

```ts
// shapes must match the REAL schema (dump prod first)
export interface Contact { id: string; user_id: string; name: string; phone: string; email: string | null; company: string | null; status: string; /* … */ }
export interface Campaign { id: string; name: string; status: 'draft'|'active'|'paused'|'completed'; /* … */ }
export interface Call { id: string; contact_id: string; call_list_id: string | null; outcome: string | null; duration_seconds: number | null; /* … */ }

export interface CampaignWithLists extends Campaign { call_lists: { id: string; name: string }[] }

export async function fetchCampaignWithLists(db: SupabaseClient, id: string, ownerId: string): Promise<CampaignWithLists | null> {
  const { data, error } = await db.from('campaigns')
    .select('id,name,status,call_lists(id,name)')
    .eq('id', id).eq('user_id', ownerId)   // ALWAYS scope by owner — service role bypasses RLS
    .single();
  if (error) throw error;
  return data as CampaignWithLists;
}
```

- Never `any` in return types/props. Cast helper results `data as T`.
- Every `supabaseAdmin` query must include the owner `.eq('user_id', …)` scope (see audit §5 — RLS is bypassed).

---

## 4. Svelte 5 migration / deprecations

- `onclick|stopPropagation` → `onclick={(e) => { e.stopPropagation(); handler(); }}` (same for `|preventDefault`).
- `<svelte:component this={C} />` (deprecated in runes mode) → `<C />` directly, or registry:
  `const Current = $derived(registry[key]); … <Current />`.
- **onMount async + cleanup** — keep `onMount`; cleanup must be a **sync** returned function:
  ```svelte
  onMount(() => {
    const ac = new AbortController();
    (async () => { data = await apiFetch('/api/x', { signal: ac.signal }); })();
    return () => ac.abort();   // sync teardown
  });
  ```
  Do NOT convert this to async `$effect`.

---

## 5. Instruction templates (for Claude Code prompts)

Reference these guides by path, e.g.:
`"Fix per docs/skills/LEADOSSTACK-SKILLS.md §1 (Svelte 5 $state typing). Annotate the variable, not the rune."`

- **T1 Fix Svelte 5 type error** → §1. Annotate variables; verify `lang="ts"`.
- **T2 Fix Supabase typing (~30)** → §3. Create `src/lib/types/database.ts` (real schema) + helpers; replace loose `.select()`s.
- **T3 Build modal (a11y)** → §2 Pattern B `<dialog>`; Esc closes; accessible close button.
- **T4 Fix form labels** → §2 Labels; `for`/`id` association; unique ids.
- **T5 Migrate onMount** → §4; keep `onMount`, sync cleanup, AbortController. (NOT async `$effect`.)
- **T6 Fix event modifiers** → §4; manual `e.stopPropagation()`.
- **T7 Full new feature** → types (§3) → API route (server, `requireAuth` + owner scope) → component (§1/§2) → wire nav. No `+page.server.ts` (SSR off).
- **T8 Type audit** → report `any`, untyped queries, un-annotated `$state`, untyped props w/ file:line.
- **T9 New query helper** → §3; add interface + helper to `database.ts`.
- **T10 Verify deploy** → `npm run check`; env vars set on Vercel (`$env`/`PUBLIC_*`, not VITE); `vercel deploy --prod` from Windows.
