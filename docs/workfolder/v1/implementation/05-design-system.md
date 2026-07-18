# S0 — Design System: Apply the Prototype's UI to studio-v1

**Status:** DONE — all 3 slices complete, verified in a real Chromium tab against the served
prototype for every built page.
**Supersedes:** the "theme tokens only" framing in `way-forward-plan.md` §3 — clarified by user:
*"by theme I meant I need UI similar to the html prototype"*. This is a full visual/structural
match, not just CSS variables on bare HTML.

## What "similar to the prototype" means, precisely

`docs/design/polanyi-studio-prototype.html` is a single 200KB static file: `:root` tokens, a
component CSS library, and hand-authored markup per page. studio-v1 today has **zero styling** —
no CSS files, no `className` usage anywhere. This slice:

1. Lifts the prototype's tokens + component CSS **verbatim** into `apps/studio-v1/src/theme/`.
2. Rebuilds `AppShell` to match the prototype's real shell: `<aside class="sidebar">` (wordmark +
   grouped nav + foot) and `<main>` with a `<header class="topbar">`.
3. Restyles the 5 already-built pages (Validator, Query Console ×3 tabs, Semantic Model, Business
   Rules, Data Sources) with the prototype's page/panel/table/chip/button vocabulary.

## Component vocabulary lifted from the prototype (source of truth — do not invent new classes)

```
.app                 — grid: 230px sidebar + 1fr main
.sidebar / .wordmark / .nav-group (+ .sub) / .nav-item (+ [aria-current="page"], .count) / .foot
.main / .topbar
.view / .view-head (h1 + .sub + .actions)
.panel / .panel-h (h2 + .hint + .actions) / .tblwrap / .tbl (th/.num/.dim/.rowlink)
.chip (+ .chip-moss / .chip-neural / .chip-good / .chip-bad / .chip-warn / .chip-doc)
.btn (+ .btn-primary / .btn-sm / [disabled])
.seg (role=group, button[aria-pressed])
.cols / .cols-2
.code (pre) / .dim / .mono / .field (.k / .v) / .hint
.tabs / .tab (aria-selected) / .tabpane (.active)
```

Full token list and every rule above's CSS body are already recorded in `way-forward-plan.md` §3
and were re-verified directly against the prototype source for this slice (colors, radii, spacing
copied exactly — not approximated).

## Honesty-driven scope decisions (what we do NOT build in this slice)

Per the project's data-honesty rule (never render what the backend doesn't produce):

- **Sidebar nav-item counts** (`Data Sources <span class="count">2</span>`) — the prototype's counts
  are static demo numbers. We render **no count** until a page wires a real fetched count. Not
  faked.
- **Sidebar foot** (`context healthy · generated 2h ago · 1 drift detected · v0.1 · context v14`) —
  no backend produces "drift count" or "generated Xh ago" yet (that's the Phase-3 run-log). **Fully
  descoped in this slice** (not just trimmed): wiring even the two real `/api/health` fields
  (`status`, `llm_mode`) into `AppShell` means giving the shell its own data fetch/loading state for
  a footer that would otherwise show almost nothing — disproportionate complexity for this slice.
  Revisit together with the topbar once S13 extends `/api/health`.
- **Topbar** (`ctx-switch` dropdown, service `.beacons`, notifications `.bell`) — all three need live
  per-service health or an alerts backend that doesn't exist. **Deferred entirely** — no topbar
  ships in this slice. Revisit once S13 (Settings/`/api/health` extensions) lands real per-service
  status.
- **Nav items for unbuilt pages** (Overview, Agent Workspace, Knowledge Graph, Documents, Ontology,
  Changes, Graph Insights, Evaluations, Activity, Registry, Settings) — **not rendered**. A nav
  entry that leads nowhere is a lie. Each is added in the same commit as the story that builds it.
  The sidebar therefore renders only 3 of the prototype's 6 groups today: **Ground** (Data Sources),
  **Explore** (Query Console), **Govern** (Semantic Model, Business Rules, Validator) — in the
  prototype's own order.
- **`data-go` + manual hash routing** — the prototype uses vanilla-JS hash routing. We already have
  React `useState<PageId>` in `AppShell`; kept as-is, just restyled. Nav items become `<button>`
  (matches the prototype's own semantics — no real href target) instead of the current `<a href="#...">`
  — a deliberate a11y correctness fix, not just a style change.

## Slices

### Slice A — Theme foundation (tokens + component CSS, no behavior change)
**Value:** every subsequent slice has the primitives available.
**Build:** `src/theme/tokens.css` (`:root` custom properties, verbatim from prototype) +
`src/theme/components.css` (the vocabulary above, verbatim rules). Imported once in `main.tsx`.
**TDD:** no new behavior → no new tests. Verified by starting the dev server and confirming tokens
apply (computed style spot-check), per CLAUDE.md's frontend-testing rule.
**Done when:** both files exist, import wired, existing 52/52 tests still green (pure addition,
nothing consumes the classes yet).

### Slice B — AppShell: real sidebar (grouped nav, button semantics, wordmark, foot)
**Value:** the app has real navigation chrome matching the prototype exactly (for built pages).
**RED:** update `AppShell.test.tsx` — nav items are `role="button"` not `role="link"`; assert group
headings ("Ground", "Explore", "Govern") are visible; assert wordmark text "Polanyi Works" visible;
existing 5 "navigate to X" tests updated to click buttons instead of links.
**GREEN:** rebuild `AppShell.tsx` sidebar markup with `.sidebar`/`.wordmark`/`.nav-group`/`.nav-item`
classes, hardcoded to the 3 groups × 5 items that exist (no dynamic filtering needed — nothing
speculative).
**MUTATE:** manual (browser-mode) — mutate active-group logic (`aria-current` assignment), confirm
existing + new tests kill it.
**REFACTOR:** assess after green.
**Done when:** all nav tests pass with button semantics, group headings visible, typecheck clean.

### Slice C — Restyle the 5 built pages with the panel/table/chip/button vocabulary
**Value:** Validator, Query Console (SQL/Cypher/SPARQL), Semantic Model, Business Rules, Data
Sources visually match the prototype.
**Approach:** per page — wrap existing content in `.view`/`.view-head`/`.panel`/`.panel-h`, apply
`.tbl`/`.tblwrap` to tables (keep `scope="col"` — already correct), apply `.chip`/`.chip-*` to
verdict/status indicators (map to existing `verdict.ts` 3-state output), apply `.btn`/`.btn-primary`
to actions, `.seg` to the Query Console tab switcher.
**TDD posture:** this is class/structural-wrapper application to markup whose roles and text are
unchanged — per the `testing` skill, styling doesn't need new tests. Existing test suites re-run
after each page as the regression gate. Any place a structural change alters an accessible name or
role (e.g., converting a div to a `.chip` span) gets a quick test-file check, not a new test file.
**Verification:** dev server + Chrome, page-by-page visual diff against the prototype screenshots,
per CLAUDE.md's "test the golden path in a browser before reporting done" rule.
**Done when:** all 5 pages restyled, full studio-v1 suite green, typecheck clean, visually confirmed
in browser.

## Pre-existing test count baseline (before this slice)
52/52 studio-v1 tests passing, 119/119 Python tests, typecheck clean (per checklist S7 entry).

## Results

**Slice A** — `tokens.css` + `components.css` added, wired into `main.tsx` (production) and
`vitest.browser.setup.ts` (tests, so screenshots/debugging reflect real styling). Pure addition:
52/52 tests unaffected, typecheck clean.

**Slice B** — Full RED-GREEN-MUTATE cycle on `AppShell.tsx`:
- RED: rewrote `AppShell.test.tsx` to assert `role="button"` (not `"link"`), `aria-current`
  transitions on navigation, and the 3 group headings ("Ground", "Explore", "Govern") — confirmed
  all 6 tests failed against the pre-existing `<a href>` implementation.
- GREEN: rebuilt the sidebar as `wordmark` + `nav` containing `Fragment`-grouped `nav-group`/
  `nav-item` markup, hardcoded to the 3 groups × 5 items with a built page (no dynamic
  filtering — nothing speculative). 6/6 tests passing.
- MUTATE (manual, browser-mode — Stryker can't reach browser-mode tests): 3 mutants applied to
  `AppShell.tsx` (aria-current forced always-true; page-equality conditional inverted for
  Validator; onClick handler made a no-op) — **all 3 killed**, 0 survivors, each reverted
  immediately after confirming the kill.
- REFACTOR: assessed, skipped — config-array + render-loop structure was already minimal.

**Slice C** — restyled all 5 built pages with the vocabulary from §"Component vocabulary" above.
Pure structural/class changes; every existing test selector (roles, labels, exact-match text)
preserved untouched, so the full existing suite served as the regression gate rather than new
tests, per the testing skill's guidance that styling isn't business behavior. Ran typecheck + full
suite after every single file change (not batched) to catch regressions immediately — all green
throughout.

**Real finding from live visual QA** (not visible from reading the CSS alone — only from viewing
rendered prototype pages in a browser): the prototype uses one consistent **list+detail** `.cols-2`
idiom across Validator (SQL | Verdict+ledger), Query Console (Query | Results), and Business Rules
(rule table | rule detail) — not documented anywhere in the CSS file, only in how the markup uses
the `.cols-2` class. Retrofitted onto Validator, all 3 Query Console tabs, RulesPage, and
GlossaryPage for fidelity — conditionally applied (`cols cols-2` only once there's a result/
selection to show in the right column, otherwise the input panel stays full-width).

Also added `.link-cell` (a chrome-free bold-text button style) after noticing the prototype's
clickable term/rule names render as plain bold text, not boxed buttons — the initial `.btn.btn-sm`
choice was visually wrong for that role.

**Final verification:**
- 53/53 studio-v1 tests, 119/119 Python tests, typecheck clean, zero regressions.
- Live side-by-side comparison in Chrome (studio-v1 dev server vs. the prototype served locally)
  for all 5 pages, including exercising the real Validator (BLOCKED verdict + rule ledger against
  live backend data) and real SQL execution in Query Console (`SELECT legal_name FROM
  counterparties LIMIT 5` → live result table) — confirmed both the visual match and that nothing
  broke in the underlying data flow.
- Confirmed (rather than assumed) that the prototype's Semantic Model "Provenance" column is
  fictional demo data, validating the earlier S5 finding/descope rather than contradicting it.
