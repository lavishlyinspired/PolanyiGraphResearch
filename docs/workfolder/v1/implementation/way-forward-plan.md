# Polanyi Studio — Way Forward (Plan of Record)

**Date:** 2026-07-18
**Author:** review of `implementation_gaps.md` + prototype + live codebase
**Status:** ACTIVE — supersedes the "v2 reframe" section of `implementation_gaps.md`. The
`checklist/checklist.md` remains the progress ledger; this file sets direction and re-sequences
what's left.

---

## 1. Verdict on `implementation_gaps.md`

That document has two halves. I **keep one and reject the other.**

### ✅ KEEP — the gap analysis (lines 1–130)

The page inventory (6 built / 10 remaining), the backend gap tiers (small/medium/large), and the
recommended execution order are **accurate and source-verified**. I re-use them directly below.
Nothing there is wrong. It is the best map we have of what's actually missing.

### ❌ REJECT — the "v2 reframe to 4 views" (lines 131–716)

The proposal to collapse the 16-page prototype into "4 primary views + 2 overlays" driven by the
"Agentic Enterprise Benchmark" is **rejected as the plan of record**, for five concrete reasons:

1. **It fabricates data on every screen.** The 4-view mockups are built from metrics with *zero
   backend*: `$4.23 cost today`, `p95: 340ms`, `1,247 nodes · 3,891 edges`, an auto-scrolling
   verdict feed, `23 terms auto-aligned`. Shipping those means either (a) faking them, or (b)
   building the observability runtime, run-log store, and background agents first. Faking violates
   the **data-honesty principle** that has governed this project from the start — we *descoped*
   provenance chips in S5 rather than invent them. We do not start inventing now.

2. **"The v2 reframe is faster" is false.** It claims ~20–27 days vs. ~28–42, but it does that by
   assuming away exactly the **Large-Effort** items its own mockups depend on (observability
   runtime, run-record store, knowledge-gap detection agent, continuous-eval triggers). Those are
   the 4–6 week items in its own tier table. You cannot both defer them to the parking lot *and*
   render them as finished panels.

3. **It abandons the product's actual differentiator.** Polanyi's thesis is the **neurosymbolic
   seam** — the LLM *proposes*, the symbolic rule gate *decides*, and a human *governs* with a full
   audit trail. The benchmark's counsel ("industry moved to autonomous agents; humans handle only
   exceptions") is advice for competing with C3/Palantir/Databricks *on their turf*. Governed,
   auditable, human-in-the-loop semantic authority is not a weakness to reframe away — it is the
   whole point. The prototype's review-and-approve model **is** the product.

4. **It contradicts your one explicit constraint.** You said: *"theme — colors similar to html
   prototype."* The reframe throws away the prototype's entire information architecture (16 pages →
   4 abstract "workbench" views). Keeping the prototype's look while gutting its structure is
   incoherent. You want the prototype; we build the prototype.

5. **The system it governs doesn't exist yet.** This is a single-tenant, internal-only,
   LLM-*optional* research runtime. There is no agent fleet to run a "control plane" over, no live
   traffic to "continuously evaluate," no multi-tenant cost to roll up. The control-plane framing is
   aspirational for capabilities we don't have.

**What survives from the benchmark:** two genuinely good ideas, folded in below as *narrow backend
slices* rather than a wholesale pivot —
- **Auto-align above threshold + review queue** — this is *already* how `align_glossary()` works
  (score ≥ 0.90 auto-attaches; 0.50–0.89 is the review band). S8 just surfaces the existing queue.
- **Per-query run-log / provenance** — genuinely worth building; it unblocks Overview, the
  Compliance graph perspective, and Activity. It becomes one honest backend slice (§5, Phase 3).

---

## 2. The way forward, in one paragraph

Keep the prototype's 16-page IA and its visual identity. **Apply the prototype's design system to the
7 already-built (but currently unstyled) pages first** — that is the single highest-value move and
exactly what you asked for. Then continue the proven vertical-slice + TDD cadence through the
remaining pages in **value order**, shipping only the honest subset of each page (never a faked
metric), and folding the two good "autonomous" ideas in as real backend where they belong. Defer the
three weakest pages (Changes, Evaluations, Graph Insights) behind the spikes the checklist already
parks them behind. No reframe, no fabrication, no abandoning the seam.

---

## 3. The theme (your explicit requirement) — lifted verbatim from the prototype

The prototype already **is** a complete, coherent design system: a warm "paper" light theme built on
moss green (brand) and neural purple (the LLM seam), with a full semantic-color set. It is
deliberately **single-theme** (there is no dark toggle in the source). We honor that exactly — dark
mode is an explicit deferral, not an omission.

### 3.1 Design tokens — copy these into `apps/studio-v1/src/theme/tokens.css`

```css
:root {
  /* Surfaces (warm paper) */
  --bg:        #ffffff;
  --panel:     #f6f7f3;
  --side:      #f3f5ee;
  --line:      #e5e8de;
  --line-2:    #cdd2c4;

  /* Ink */
  --ink:       #1d211a;
  --ink-2:     #454c3d;
  --ink-3:     #6c7362;

  /* Brand — moss green (primary actions, focus, nav-active) */
  --moss:      #3e5226;
  --moss-deep: #32421e;
  --moss-tint: #edf1e3;
  --moss-line: #c9d3b4;

  /* Neural — purple (the LLM-proposes seam: agent, generated, AI-suggested) */
  --neural:      #5b4fc7;
  --neural-text: #443aa6;
  --neural-tint: #edebfa;
  --neural-line: #cdc7ef;

  /* Semantic — verdict + status */
  --good: #1e7a4a;  --good-tint: #e2f1e8;  --good-line: #b7dcc6;
  --bad:  #a83226;  --bad-deep:  #8c2a20;  --bad-tint:  #fbe9e6;  --bad-line: #ecc4bc;
  --warn: #8a6116;  --warn-tint: #f8efda;  --warn-line: #e6d3a4;
  --doc:  #2276b5;  --doc-tint:  #e4f0f8;  --doc-line:  #bcd8ec;

  /* Graph node identity */
  --g-entity:  #557f26;
  --g-term:    #5b4fc7;
  --g-doc:     #2276b5;
  --g-mention: #b07818;

  /* Chart */
  --chart-pass:  #7e9155;
  --chart-block: #a83226;

  /* Type */
  --sans: -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,Roboto,sans-serif;
  --mono: ui-monospace,"SF Mono","Cascadia Code",Menlo,Consolas,monospace;

  /* Z-index scale */
  --z-topbar: 20;
  --z-drawer: 30;
  --z-dialog: 50;
  --z-toast:  60;
}
```

### 3.2 Semantic mapping — how tokens bind to what we've already built

| UI concept (already built)                     | Token(s)                          |
|------------------------------------------------|-----------------------------------|
| Validator verdict: **blocked**                 | `--bad` / `--bad-tint` / `--bad-line` |
| Validator verdict: **passed with warnings**    | `--warn` / `--warn-tint` / `--warn-line` |
| Validator verdict: **passed**                  | `--good` / `--good-tint` / `--good-line` |
| Anything LLM-proposed / generated / agent      | `--neural` family                 |
| Primary buttons, active nav, focus ring        | `--moss` / `--moss-deep`          |
| Page ground / cards / rails                    | `--bg` / `--panel` / `--side`     |
| Table borders, dividers                        | `--line` / `--line-2`             |
| Document/ingestion surfaces (S9)               | `--doc` family                    |
| Graph node fills (S11)                         | `--g-*` family                    |

### 3.3 Component primitives (from the prototype's CSS, to standardize)

- **Radii:** `6px` buttons/cards/inputs · `999px` pills/chips · `3–4px` kbd/badges.
- **Primary button:** `background:var(--moss); color:#fff; :hover→var(--moss-deep)`.
- **Focus:** `:focus-visible{outline:2px solid var(--moss);outline-offset:2px}` (accessibility —
  keep it, it's already correct in the prototype).
- **Pills/status dots:** `border:1px solid var(--line); border-radius:999px` + a 7px `--dot`.
- **Shell:** `topbar` + `sidebar` (`nav-group` / `nav-item`) + main canvas + optional right
  `inspector`/`drawer`. This is the prototype's frame and becomes our `AppShell` layout.

---

## 4. Working method (unchanged — it's working)

Every slice keeps the non-negotiable cadence already used for S1–S7:

- **RED → GREEN → MUTATE → KILL MUTANTS → REFACTOR**, load `tdd`/`testing`/`mutation-testing`/
  `refactoring` before any code.
- **Data honesty:** never render a number the backend doesn't produce. If the data isn't there,
  descope the panel and note it — don't fake it.
- **Backend built per-slice** (vertical), not as a separate phase.
- **LangChain/LangGraph docs MCP** (`mcp__claude_ai_docs_langchain_mcp__*`) consulted for any slice
  touching `SemanticAgent`/LangGraph (Phase 4, S10) or judge models (Evaluations spike).
- **Styling caveat:** studio-v1 tests run in Vitest Browser Mode against real Chromium — assert on
  **roles/text/ARIA**, not on colors or class names, so the theme slice doesn't churn tests.
- Continue **not** pausing for commit approval mid-stream, per your standing instruction.

---

## 5. Re-sequenced roadmap

Phases are ordered by **value delivered per unit of honest, already-backed work**. Theme comes first
because it's the biggest visible gap and your stated priority.

### ▶ Phase 0 — Design system foundation  *(NEW — do this first)*

**S0. Apply the prototype theme to the shell + 7 built pages.**
- **Value:** the app finally *looks* like Polanyi; every subsequent page inherits the system for
  free.
- **Build:** `src/theme/tokens.css` (§3.1 verbatim) + `tokens.ts` for JS-side color access; a real
  `AppShell` frame (topbar + sidebar `nav-group`/`nav-item` + canvas) replacing the bare `<nav>`;
  restyle Validator, Query Console (3 tabs), Semantic Model, Business Rules, Data Sources using
  tokens + the component primitives (§3.3).
- **Honesty:** the sidebar footer / topbar beacons in the prototype show `context health`, `drift
  count`, `version` — wire **only** the fields `/api/health` + `/api/context` actually return;
  descope the rest (drift count has no backend → omit until the run-log exists).
- **Tests:** keep role/text assertions; add shell-nav tests for the real sidebar. Do **not**
  assert on hex values.
- **Done when:** all 7 surfaces render in the prototype's identity, all existing tests still green,
  typecheck clean.

### ▶ Phase 1 — Govern completion (existing backend or small additions)

**S8. FIBO alignment review queue (read-only).**
- Surface the 3 bands the backend already produces: auto-aligned (≥ 0.90), needs-review (0.50–0.89),
  rejected/unmapped (< 0.50). This is the benchmark's "review queue" idea — *already real*.
- Backend: `align_glossary()` exists; add a read endpoint that returns per-term candidate + score
  bands (today `/api/context/align` returns only an aggregate; extend to expose per-term detail).

**S8b. Accept / reject one alignment candidate (write).**
- The one genuinely-missing small endpoint from the gaps doc: `POST /api/context/align/{term}/accept`
  and `…/reject`, persisting the decision. Gated behind S8.

**S9. Ingest a document → see resolved mentions (incl. SHACL-held state).**
- Backend (Medium): `GET /api/documents` (list + status + mention counts), `GET /api/documents/{id}`
  (text + annotated mention spans). Needs a simple file/JSON document store.
- Frontend: document list, `<mark>`-highlighted detail view, SHACL-held failure state. `--doc` token
  family.

### ▶ Phase 2 — Hero surface (the seam, made visible)

**S10. Ask the grounded agent a question.**
- **Consult the LangChain/LangGraph docs MCP here** (first slice that touches `SemanticAgent`).
- Composer → answer → reasoning trace showing a blocked→self-corrected step (the seam in action).
  `--neural` family throughout.
- **HARD DESCOPE (unchanged):** Evidence-Packet confidence/calibration + Reasoning-meta
  resource-allocation panels have **zero** backend — must not ship as static fakes.

**S11 + S11b–e. Knowledge graph — base perspective, then 4 more.**
- NVL canvas + inspector + reuse the Cypher console from S3. `--g-*` node colors. One follow-up
  story per additional perspective (Glossary / Compliance / Documents / Lineage) — no scope-creep.

### ▶ Phase 3 — The one autonomous idea worth building: provenance run-log

**S-Runlog. Append-only run-record store + `/api/runs`.**
- Every validate/exec/ask logs: timestamp, query, verdict, rules checked, duration. This is the
  benchmark's "provenance-as-a-service" idea, done honestly and minimally.
- **Unblocks three things at once:** Overview verdict feed (real, not faked), the Compliance graph
  perspective, and the Activity page — replacing ~three parking-lot "zero backend" gaps with one
  real store.

### ▶ Phase 4 — Admin & shell completion

**S12. Registry / capabilities (read-only)** · **S13. Settings** (extend `/api/health`:
GraphDB/Neo4j/LLM/SHACL/skills-count — all real, read-only) · **S14. Overview** — LAST, aggregates
**only** real data from all prior phases + the run-log (no placeholder metrics).

### ⏸ Parking lot (unchanged — each needs a spike before it's a story)

- **Changes** subsystem (version store + semantic diff + audit) — own epic.
- **Evaluations** — SPIKE FIRST (5 deterministic `validate_sql` cases), *then* decide the page.
  LangChain docs MCP for any judge-model step.
- **Graph Insights** — SPIKE FIRST: wire real Neo4j GDS or kill `gnn-runtime`. No UI before the
  answer. Keep the prototype's "experimental" honesty framing.
- **MCP server (Polanyi-native)** — legitimate future story; the Ontotext GraphDB MCP is already
  wired, so this is additive, not a v1 blocker.
- RBAC / multi-tenancy — deferred product decision; v1 stays internal-only.

---

## 6. What changes vs. today

| Area              | Before                          | After this plan                                  |
|-------------------|---------------------------------|--------------------------------------------------|
| Visual identity   | 7 pages, **zero styling**       | Prototype design system applied everywhere (S0)  |
| Direction         | 3 open options in gaps doc      | **One** decided path — build the prototype, honestly |
| "Autonomous" ideas| Wholesale reframe (fabricated)  | Two real slices: review-queue (S8), run-log (Phase 3) |
| Page count        | 16 (reframe wanted 4)           | 16 kept; 3 weakest deferred behind existing spikes |
| Data honesty      | At risk under reframe           | Preserved — descope over fake, always            |

---

## 7. Immediate next step

Begin **S0** — write `tokens.css`/`tokens.ts` and the real `AppShell` frame, then restyle the 7 built
pages, RED-GREEN-MUTATE-KILL-REFACTOR, keeping tests on roles/text (not colors). Update
`checklist/checklist.md` with a new "Phase 0 — Design system" row on completion.
