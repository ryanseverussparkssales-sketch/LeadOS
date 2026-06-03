# SvelteKit Rules for LeadOS

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

## What "professional" means for LeadOS specifically
1. Pages load with data already present (SSR via +page.server.ts), no flash
2. Forms use actions + enhance, not raw fetch
3. Mutations invalidate the right data, not reload everything
4. AI endpoints stream, never block
5. Error states are explicit, not silent failures
6. TypeScript strict throughout, no `any` except where genuinely dynamic
