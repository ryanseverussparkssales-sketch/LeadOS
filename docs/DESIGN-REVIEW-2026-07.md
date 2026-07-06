# RogueOS — Design & Usability Review

**Date:** 2026-07-05
**Scope:** Design language, eye-flow / visual-hierarchy critique, design-principles scorecard, and a Nielsen heuristic usability audit of the RogueOS SvelteKit app, benchmarked against award-winning web design.
**Method:** Read-only pass over `src/app.css`, `Sidebar.svelte`, `(app)/+layout.svelte`, `PageHeader.svelte`, and five representative pages (dashboard, contacts, pipeline, assistant, booking-links). External benchmarks pulled via web search — sources cited inline.
**Status:** Advisory. No code changed by this review. Recommendations are framed as a possible next execution wave.

---

## 1. Current design language

RogueOS runs an **editorial-luxury-dark-SaaS** system ("Edelhaus"): a four-step near-black surface ramp (`#000` page → `#080808` sidebar → `#0f0f0f` card → `#141414` input, plus `#1c1c1c` raised) with only three border weights, paired with a deliberately literary type stack — **Bodoni\*** (Playfair Display fallback) for display, **Cormorant SC** for all-caps section labels, and **Inter** for functional UI text. The accent story is unusually disciplined: the base accent is *white* (`--c-accent:#fff`), with a signature **brass `#c8a24a` = positive/call** and **crimson `#a01e2e` = end/danger** pair replacing conventional green/red. Motion is restrained and tasteful — View Transitions cross-fade between routes, nav icons "draw themselves in" on the active row, and a few celebratory pulses (win ring, count-up). A just-shipped WCAG pass lifted muted text (`#6e6e6e`/`#5a5a5a` → `#8a8a8a`) and added a 2px keyboard focus ring plus global reduced-motion support (`src/app.css` lines 339–381).

The result reads as intentional and high-craft at the token level. The gap this review targets is **application**: the tokens describe a luxury magazine, but several core pages render as flat, uniform-weight walls of dense data where the system's own hierarchy tools (surface lightness, the serif display, the brass accent, whitespace) are under-used to *direct the eye*.

---

## 2. Benchmark — award-winning exemplars

Award juries weight this exactly the way this review does. **Awwwards scores Design 40% / Usability 30% / Creativity 20% / Content 10%** ([Awwwards evaluation system](https://www.awwwards.com/about-evaluation/)) — so craft *and* usability dominate; novelty is secondary.

| Exemplar | Stack | What to steal | URL |
|---|---|---|---|
| **Linear** (app + marketing) | Next.js (not Svelte) | Ruthless hierarchy: one focal action per view, oversized Inter Display headings, dark-as-default with luminance-step surfaces, whitespace as a first-class element | [linear.app](https://linear.app) · [LogRocket on Linear design](https://blog.logrocket.com/ux-design/linear-design/) |
| **Vercel** (dashboard + marketing) | Next.js | "Mostly dark, mostly type, densely informative" but still legible — dense data with clear rank; restrained accent on a near-black base | [vercel.com](https://vercel.com) |
| **Attio / Mercury / Ramp** (CRM/fintech dashboards) | React | Data-dense dashboards that *still* have a focal point per screen; tabular-nums, generous row rhythm, single primary CTA | [925studios SaaS dashboard roundup 2026](https://www.925studios.co/blog/saas-dashboard-design-examples-2026) |
| **norgram.co** | **SvelteKit** | Awwwards Developer Award + Site of the Day (Dec 2025) — motion choreography and typographic scale on a SvelteKit stack | [awwwards.com/websites/svelte](https://www.awwwards.com/websites/svelte/) |
| **L'Étude — Creative Studio** | **SvelteKit** | Developer Award + SOTD (Oct 2025) — editorial serif display + restrained palette; closest aesthetic cousin to RogueOS's Bodoni direction | [awwwards.com/websites/svelte](https://www.awwwards.com/websites/svelte/) |
| **Maison Ferrand** | **SvelteKit** | Awwwards Honorable Mention (Dec 2025) — luxury editorial layout, big serif, lots of negative space | [awwwards.com/websites/svelte](https://www.awwwards.com/websites/svelte/) |
| **THISISNOTANOTHERAGENCY** | **SvelteKit** | Honorable Mention (Jan 2026) — confident use of scale contrast and grid tension | [awwwards.com/websites/svelte](https://www.awwwards.com/websites/svelte/) |

**Takeaway pattern across all seven:** they win on *hierarchy and restraint*, not decoration. Every screen has an obvious "land here first" element; the accent is rare enough that its appearance *means something*; type scale jumps are large (not the timid 22→16→13 steps RogueOS uses); and whitespace is used to group and separate rather than to pad. RogueOS already owns the raw ingredients (serif display, brass accent, four surfaces) — the exemplars simply *spend* them on directing attention.

---

## 3. Directing-flow critique, per page

Grounded in the eye-flow literature: eyes follow **F-patterns on text/data-heavy pages** and **Z-patterns when no dominant block guides them** ([NN/g F-pattern via Think360](https://think360studio.com/blog/f-pattern), [Z vs F](https://www.andrewpetzer.co.za/web-design/z-pattern-vs-f-pattern-web-design/)); a **focal point** is the one element that breaks the background pattern and captures attention first ([99designs on hierarchy](https://99designs.com/blog/tips/visual-hierarchy-landing-page-designs/)). In dark UI, **hierarchy comes from surface lightness, not shadow** ([Uxcel elevation for dark UI](https://uxcel.com/blog/mastering-elevation-for-dark-ui-a-comprehensive-guide-342), [Muzli dark systems](https://muz.li/blog/dark-mode-design-systems-a-complete-guide-to-patterns-tokens-and-hierarchy/)).

### 3.1 Dashboard (`(app)/dashboard/+page.svelte`)

**Where the eye lands:** nowhere in particular. The header greeting is display-font but only 26px (`titleSize={26}`, line 235); below it a "Widget Band" strip, then a fully user-composed 6-column widget grid where **every card is the same `#111` fill, same `#2a2a2a` border, same radius** (`.widget-card`, lines 497–510). There is no focal card, no primary metric, no "you should look here" — it's an even mesh. The default layout (timer / stats / recent-calls / chat) doesn't establish a hero number.

**Problems**
- The `.widget-card` background `#111` sits *between* the `--c-card` (`#0f0f0f`) and `--c-input` (`#141414`) tokens — a fifth, off-ramp surface value. Every card is one flat step, so the luminance-hierarchy tool is spent uniformly and reads as flat.
- Section labels for the band ("Widget Band", "WIDGET BAND") use `#333`/`#444` micro text (lines 434–450) — so faint that the *chrome* competes with nothing and adds visual noise without adding structure.
- The greeting — the one place the serif display *should* dominate as the F-pattern's top bar — is undersized and immediately buried by the band's `⚙ Configure` control.

**Concrete changes (in existing tokens)**
1. **Give the dashboard a hero band.** Reserve the top full-width row for one KPI strip (e.g. calls today · connect rate · pipeline weighted · booked). Render the primary number in `--font-display` at `--text-hero` (52px, already defined but unused on this page) with a brass `--accent` underline. This becomes the F-pattern anchor.
2. **Rank the widget grid by luminance.** Promote the single most-important widget (default: `stats` or `pipeline`) to `--c-input` (`#141414`) fill and `--c-border-subtle` (`#262626`) border; leave all others at `--c-card` (`#0f0f0f`) / `--c-border` (`#1a1a1a`). One lighter card = one focal point, using the ramp the design system already declares. Retire the ad-hoc `#111`.
3. **Lift the greeting** to `titleSize={40}`+ and move the "Widget Band / Configure" affordance into the existing `PageHeader` actions slot so the top-left is pure editorial headline, not headline-plus-widget-config.
4. **Demote band chrome.** The "WIDGET BAND" label at `#333` is below even the WCAG-lifted floor; either raise to `--c-text-faint` used purposefully or drop the label entirely (the band is self-evidently widgets).

### 3.2 Pipeline (`(app)/pipeline/+page.svelte`)

**Where the eye lands:** the header is good — "Deal Pipeline" in display font with a **brass weighted-forecast number** (line 246) is a genuine focal point, and the forecast strip (lines 262–286) is a clean secondary band. This is the strongest page reviewed.

**Problems**
- The forecast strip renders every metric at identical `text-sm` weight (lines 264–284); "Commit (≥75%)" gets brass but "This month" — arguably the number a rep acts on daily — is plain white. Accent isn't ranking; it's decorating one arbitrary cell.
- Kanban columns are 224px (`w-56`) with `#0a0a0a` bodies on a `#000` page — a 10/255 luminance delta. Columns barely separate from the page; the board reads as one field of cards rather than seven lanes. This is the "elevation via lightness" lever left on the table.
- Stage color dots (line 370) are the only hue on the board, but they're 8px and easy to miss; the **won/lost** columns use green/red glyphs (`Won ✓`/`Lost ✗`, lines 27–28) which *contradict* the brass/crimson semantic system declared in `app.css` (`--call`/`--end`). Two color languages fight.
- The deal detail drawer (lines 416–445) is a fixed 320px panel with **no backdrop and no transition** — it just appears, and the board behind stays fully interactive, which is disorienting (see §5, control/status).

**Concrete changes**
1. **Rank the forecast strip.** Make "This month · weighted" the dominant cell: `--text-head` (16px) value + brass accent; render the rest at `--text-body`/secondary. One brass number, chosen for its action-relevance, not spread across cells.
2. **Lift the kanban lanes** from `#0a0a0a` to `--c-card` (`#0f0f0f`) bodies with a `--c-border` frame, so each lane is a distinct surface step above the `#000` page — the columns should read as *containers*, per dark-UI elevation.
3. **Reconcile stage colors with the token system.** Map `won` → `--call` (brass) and `lost` → `--end` (crimson); drop the `✓`/`✗` glyph-color mix. Keep the mid-funnel hue dots but bump to 10px.
4. **Make the detail panel a real overlay:** add a dimmed backdrop (`bg-black/40`) + `fly`/`fade` transition (both already imported elsewhere) and trap focus — currently a Fitts's-law + control-visibility miss.

### 3.3 Contacts (`(app)/contacts/+page.svelte`)

**Where the eye lands:** the "+ New" white button (line 397–399) — correctly the one filled/inverted control in the header, a clean primary. Good. Below that, though, the page is a paginated dense table (50/page) whose rows are all equal weight.

**Problems**
- The header actions row carries **five controls** (Search, + New, Import, ⊞ Columns, ↓ Export) all at similar visual weight except the white "+ New". That's borderline for Hick's law at the top of a work surface; Import/Columns/Export are secondary and could collapse.
- Column headers vs. data rows have little contrast rhythm; with `phone/tags/calls` as defaults the table is scannable, but there's no zebra, no hover-lift beyond color, and no sticky header evident — long lists lose their column context on scroll (F-pattern breaks).
- Bulk-action affordances appear only after selection (good progressive disclosure) but rely on `window.confirm()` for destructive ops (line 306) — jarring against the otherwise bespoke dark UI (see §5).

**Concrete changes**
1. **Collapse secondary header actions** into a single `⋯ More` menu (Import / Columns / Export), leaving Search + "+ New" as the only two top-level controls. Fewer competing targets, clearer primary.
2. **Add row rhythm:** a `--c-border-ghost` (`#0d0d0d`) bottom hairline per row + a `--c-card`→`--c-input` hover fill, and make the column header row sticky with a `--c-sidebar` fill so context survives scroll.
3. Replace `confirm()` on bulk DNC/delete with an in-app confirm affordance consistent with the deal-delete `confirmDeleteId` pattern already used in pipeline (line 207) — the app already has the better pattern; use it everywhere.

### 3.4 Assistant (`(app)/assistant/+page.svelte`)

**Where the eye lands:** clean and modern — centered `max-w-3xl` transcript, an engine badge (Local/Cloud) top-right, quick-action chips, a focused composer. This page is the most contemporary and needs the least. The empty state (`EmptyState`, line 364) gives a clear first action.

**Problems**
- The engine badge uses **emerald green** for "Local" (line 351) — again outside the brass/crimson/white system; it's the only green on the surface and reads as a foreign accent.
- Quick-action chips and the composer are all `#0d0d0d`/`#141414` on `#000` with `#1a1a1a`/`#262626` borders — well-tokenized, but the **Send button carries no accent** (line 495: same `#141414` as the composer), so the primary action doesn't stand out. Per 60-30-10, the one action per view is exactly where the 10% accent should go ([60-30-10 rule](https://www.align.vn/blog/the-60-30-10-color-rule-in-uiux-design/)).
- Tool chips render literal `🔧 {chip}…` — functional but the emoji clashes with the otherwise typographic system.

**Concrete changes**
1. Recolor the "Local engine" dot from emerald to `--call` (brass) to unify with the system; keep grey for cloud.
2. **Accent the Send button** when `draft` is non-empty: brass fill (`--accent` / `--accent-ink`) so the primary action is the page's single 10% accent. Leave Stop as the neutral outline it is.
3. Swap the `🔧` emoji for a small line icon (the app ships an `Icon` component) to stay within the type/line-icon language.

### 3.5 Booking Links (`(app)/booking-links/+page.svelte`)

**Where the eye lands:** the "+ New link" white button, correctly primary. Note this page **breaks the shared `PageHeader` pattern** — it hand-rolls its own `<h1 class="text-xl font-semibold">` (line 237) in Inter, not the `--font-display` serif every other page uses. It also uses Tailwind `neutral-100/500` utilities instead of the `--c-text-*` tokens (lines 237–262).

**Problems**
- **Consistency break:** Inter-semibold title vs. Bodoni display everywhere else; `text-neutral-*` vs. `--c-text-*` tokens. A user moving from Contacts to Booking Links feels a subtle "different app" jolt (violates Nielsen consistency).
- Form labels here *are* well done (uppercase tracked `text-[11px]`, zod inline errors on line 256) — this is the **best-in-app form pattern** and should be the template, ironically on the page that most breaks the header pattern.

**Concrete changes**
1. Replace the hand-rolled header with `<PageHeader title="Booking Links" subtitle="…">` and move "+ New link" into its `actions` snippet — one line, restores serif display + shared spacing.
2. Swap `text-neutral-*` for the `--c-text-*` tokens so the page tracks the WCAG-lifted palette automatically.
3. **Promote this page's form pattern** (labeled fields + inline zod errors) to a shared `FormField` component and adopt it in the pipeline "New Deal" and contacts "New" forms, which currently use bare placeholders with no labels.

### 3.6 Navigation IA (Sidebar) — Hick's-law review

The sidebar pairs **a 4-mode switcher** (Dial / Campaigns / Agency / Analyze) with **7 nav groups** (DIALING, CONTACTS, WORK, CONTENT, ANALYTICS, AGENCY, SYSTEM) totaling **~40 destinations**. Modes are a smart Hick's-law mitigation — they shard the 40 links so only one mode's groups show at once ([Hick's law: more choices = slower decisions](https://think360studio.com/blog/f-pattern) / [freeCodeCamp handbook](https://www.freecodecamp.org/news/how-to-apply-academic-theories-to-human-centered-web-design-handbook/)). But there's real redundancy and residual overload:

- **Lead routes are fragmented across five entries:** `/leads` (Lead Gen), `/scraper`, `/leads-inbox` (Lead Inbox), `/my-leads`, `/import` — plus `/contacts` and `/companies`. A new user cannot predict which one holds "the leads." (`Sidebar.svelte` lines 28–35, 76.)
- **Two settings entry points** (SYSTEM group line 81, *and* footer line 494) and **two AI entries** (`/assistant` in DIALING line 19, `/ai-assistant` in footer line 473) — near-duplicate labels for different routes is a recognition trap.
- Mode auto-switching on navigation (lines 154–158) is clever but means the visible nav can *change out from under the user* when they click a cross-mode link — a subtle "where did my menu go" moment.

**Recommendation**
1. **Consolidate the five lead routes** into one "Leads" hub with tabs (Sources / Scraper / Inbox / Mine / Import) — collapses five nav lines to one and gives leads a predictable home.
2. **Kill the duplicate footer Settings** (line 494) and rename either `/assistant` or `/ai-assistant` so the two AI surfaces are distinguishable (e.g. "Assistant" vs. "Global AI").
3. Keep the mode switcher, but on cross-mode navigation, **flash the destination group** (brief highlight) so the user sees *why* the menu changed rather than being surprised by it.

---

## 4. Design-principles scorecard

Each rated 1–5 (5 = award-grade). Grounded in what was read.

| Principle | Score | Justification |
|---|---|---|
| **Visual hierarchy** | **2.5 / 5** | Tokens for hierarchy exist (`--text-hero` 52px, 4-surface ramp) but pages under-use them: dashboard is an even widget mesh, pipeline forecast strip is uniform weight. Pipeline header and Contacts primary CTA are the bright spots. |
| **Eye-flow / focal point** | **2.5 / 5** | Only pipeline and contacts have a clear "land here first." Dashboard has none; the F-pattern top bar (greeting) is undersized. No page fully exploits luminance to create a single focal card. |
| **Typography** | **3.5 / 5** | Strong, opinionated stack (Bodoni / Cormorant SC / Inter) and a defined scale. Loses points because the scale *jumps are timid* (22→16→13→11) so display rarely dominates, and Booking Links breaks the serif entirely. `tabular-nums` for data is a nice touch. |
| **Color / accent discipline** | **3 / 5** | The brass/crimson/white system is genuinely distinctive and restraint-minded. But it's applied inconsistently: emerald engine badge, green/red kanban stages, blue checkbox accents, `#3b82f6` "add another" — four stray hues that undercut the disciplined core. |
| **Spacing / density** | **2.5 / 5** | 8pt grid is defined and mostly honored, but core surfaces run dense (50-row tables, 224px kanban lanes, tight forecast strip). Whitespace isn't used to *group* — award exemplars breathe; RogueOS packs. |
| **Motion** | **4 / 5** | Tasteful and modern: View Transitions, active-nav icon draw-in, count-up, reduced-motion honored globally. Doesn't overreach. Minor: the pipeline detail drawer has no transition. |
| **Consistency** | **3 / 5** | `PageHeader` is a strong shared pattern and most pages use it; toasts, skeletons, and empty states are consistent. Undercut by Booking Links' hand-rolled header + `neutral-*` utilities, two settings/AI entries, and mixed confirm patterns (`window.confirm` vs. in-app `confirmDeleteId`). |

**Composite: ~3.1 / 5** — a high-craft token foundation held back by uneven application of its own hierarchy, spacing, and accent rules. The distance to award-grade is mostly *editing and enforcement*, not a redesign.

---

## 5. Usability audit — Nielsen's 10 heuristics

Assessed against the code as read. ([NN/g 10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/).)

| # | Heuristic | Finding | Severity | Fix | Evidence |
|---|---|---|---|---|---|
| 1 | **Visibility of system status** | Strong: global `Toast`, loading skeletons (dashboard/pipeline), streaming "thinking…" + engine badge, saving states. Gap: pipeline detail drawer appears with no transition/backdrop, so a state change is easy to miss. | Low | Add backdrop + `fade`/`fly` to the deal drawer. | `+layout.svelte` L154; `dashboard` L328–333; `pipeline` L416; `assistant` L403–408 |
| 2 | **Match to real world** | Good CRM vocabulary (Pipeline, Commit, Weighted forecast, Stale). Brass/crimson for call/hang-up is intuitive to dialers. Minor: "Widget Band" is internal jargon. | Low | Rename "Widget Band" → "Overview" or drop the label. | `pipeline` L27,246,273; `dashboard` L250 |
| 3 | **User control & freedom** | Assistant has explicit **Stop** (abort). Pipeline delete is a two-step in-app confirm. But bulk destructive actions and booking delete fall back to native `window.confirm`, and there's **no undo** on bulk DNC / soft-delete. | **High** | Replace `confirm()` with in-app confirm (reuse `confirmDeleteId` pattern); add "Undo" toast for bulk DNC / soft-delete. | `contacts` L306; `booking-links` L201; `pipeline` L207 (good pattern) |
| 4 | **Consistency & standards** | `PageHeader`, toasts, skeletons standardized. Broken by Booking Links' bespoke Inter header + `neutral-*` utilities, and two confirm patterns coexisting. | Med | Adopt `PageHeader` + `--c-text-*` on Booking Links; standardize on the in-app confirm. | `booking-links` L237–262 vs. `PageHeader.svelte` |
| 5 | **Error prevention** | zod + inline field errors are live on Booking Links and the superforms pilot — excellent. But most forms (pipeline "New Deal", contacts "New", dashboard) are **bare placeholders with no labels/validation** beyond `required`. | **High** | Roll the Booking Links labeled-field + zod pattern into a shared `FormField` and apply to Deal/Contact create forms. | `booking-links` L253–258 (good); `pipeline` L311–335 (bare) |
| 6 | **Recognition over recall** | Icons + labels in nav, column visibility persisted, filters in URL (pipeline `?client=`, contacts). Undercut by 5 near-synonymous lead routes and 2 AI/Settings entries — user must recall which is which. | Med | Consolidate lead routes into one hub; de-duplicate Settings/AI entries. | `Sidebar.svelte` L28–35,73–83,472–497 |
| 7 | **Flexibility & shortcuts** | Global search, `?`-opens-help, keyboard shortcuts component, snippet expander, per-user dashboard layout, saved columns/modes. Genuinely strong power-user surface. | — (strength) | Keep. Consider surfacing shortcut hints in-context. | `+layout.svelte` L131–140,155; `dashboard` layout persistence |
| 8 | **Aesthetic & minimalist** | High-craft dark editorial system. Weakened by dense header action rows (contacts: 5 controls) and faint decorative chrome (band labels at `#333`) that add noise without structure. | Med | Collapse secondary header actions into `⋯`; drop/raise sub-floor chrome labels. | `contacts` L396–439; `dashboard` L434–450 |
| 9 | **Help users recover from errors** | `ErrorRecoveryBar`, `OfflineBanner`, toast errors with server body snippets (contacts bulk), graceful `catch` throughout. Solid. Gap: some `catch {}` swallow silently (e.g. clipboard copy, toggleActive) with no user signal. | Low | Surface a toast on silent failures (copy-link, toggle-active). | `+layout.svelte` L152–153; `contacts` L318–323; `booking-links` L196,215 |
| 10 | **Help & documentation** | `HelpPanel` + `?` shortcut, `OnboardingChecklist`, getting-started flow. Above average for an MVP. | — (strength) | Keep; ensure Help is reachable from mobile top bar too. | `+layout.svelte` L157,218 |

**Top usability issues (ranked):**
1. **[High] No undo + native `confirm()` on destructive bulk/booking actions** — bulk DNC and soft-delete are irreversible with only an OS dialog. Fix: in-app confirm + Undo toast.
2. **[High] Create forms lack labels/inline validation** — only Booking Links (zod pilot) does it right; Deal/Contact forms are bare placeholders. Fix: shared `FormField` + zod.
3. **[Med] Nav redundancy** — 5 lead routes, duplicate Settings/AI entries strain recognition. Fix: consolidate.
4. **[Med] Accent/color inconsistency** — emerald, green/red, blue leak past the brass/crimson/white system. Fix: map all semantics to tokens.
5. **[Med] Booking Links breaks the design system** (header + palette). Fix: adopt `PageHeader` + tokens.

---

## 6. Prioritized top-10 improvements (possible next wave)

Quick wins first; effort tagged **S / M / L**.

| # | Improvement | Why (principle) | Effort |
|---|---|---|---|
| 1 | Accent the **Send** button (assistant) + recolor engine dot brass; map kanban won/lost + engine badge to `--call`/`--end` tokens | Kills 4 stray hues; restores 60-30-10 accent discipline | **S** |
| 2 | Port **Booking Links to `PageHeader` + `--c-text-*` tokens** | Fixes the single biggest consistency break | **S** |
| 3 | **De-duplicate nav**: remove footer Settings, disambiguate `/assistant` vs `/ai-assistant`, drop/raise faint band labels | Recognition + minimalism | **S** |
| 4 | **Lift kanban lanes** `#0a0a0a`→`--c-card` and rank the forecast strip (one brass "This month" number) | Elevation-via-lightness; a focal point on the board | **S** |
| 5 | **Add backdrop + transition + focus-trap** to the pipeline deal drawer | System-status + user-control | **S** |
| 6 | **Dashboard hero KPI band**: one `--text-hero` primary metric row above the widget grid; promote one widget to `--c-input` surface as focal card | Gives the dashboard an F-pattern anchor + focal point | **M** |
| 7 | Extract a shared **`FormField`** (label + inline zod error) from Booking Links; apply to Deal + Contact create forms | Error prevention across the app | **M** |
| 8 | Replace `window.confirm()` with **in-app confirm + Undo toast** for bulk DNC / soft-delete / booking delete | User control & freedom (High) | **M** |
| 9 | **Contacts polish**: collapse 3 secondary header actions into `⋯`, add row hairlines + hover fill + sticky header | Hick's law + F-pattern scannability | **M** |
| 10 | **Consolidate 5 lead routes** into one tabbed "Leads" hub | Recognition + Hick's law; predictable home for leads | **L** |

**Sequencing note:** items 1–5 are same-day token/markup edits that measurably raise the color-discipline and consistency scores; 6–9 are the hierarchy/forms substance that moves the composite toward award-grade; 10 is an IA project worth its own spike. None require a redesign — the "Edelhaus" system already has the right tokens; this wave is about *spending them to direct the eye*.

---

### Sources
- Awwwards evaluation system (Design 40 / Usability 30 / Creativity 20 / Content 10): https://www.awwwards.com/about-evaluation/
- Awwwards Svelte showcase (norgram.co, L'Étude, Maison Ferrand, THISISNOTANOTHERAGENCY): https://www.awwwards.com/websites/svelte/
- NN/g — 10 Usability Heuristics: https://www.nngroup.com/articles/ten-usability-heuristics/
- NN/g — Using Color to Enhance Design: https://www.nngroup.com/articles/color-enhance-design/
- Refactoring UI dark-mode / elevation (via Uxcel): https://uxcel.com/blog/mastering-elevation-for-dark-ui-a-comprehensive-guide-342
- Dark-mode surface tokens & hierarchy (Muzli): https://muz.li/blog/dark-mode-design-systems-a-complete-guide-to-patterns-tokens-and-hierarchy/
- F-pattern (Think360): https://think360studio.com/blog/f-pattern
- Z vs F pattern (Petzer): https://www.andrewpetzer.co.za/web-design/z-pattern-vs-f-pattern-web-design/
- Visual hierarchy / focal point (99designs): https://99designs.com/blog/tips/visual-hierarchy-landing-page-designs/
- Academic theories in web design — Hick's & Fitts's laws (freeCodeCamp): https://www.freecodecamp.org/news/how-to-apply-academic-theories-to-human-centered-web-design-handbook/
- Fitts's law UI examples (LogRocket): https://blog.logrocket.com/ux-design/fitts-law-ui-examples-best-practices/
- 60-30-10 color rule: https://www.align.vn/blog/the-60-30-10-color-rule-in-uiux-design/
- Linear design trend (LogRocket): https://blog.logrocket.com/ux-design/linear-design/
- SaaS dashboard design examples 2026 (925studios): https://www.925studios.co/blog/saas-dashboard-design-examples-2026
