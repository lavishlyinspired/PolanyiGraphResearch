# Studio v1 Rebuild — Master Checklist

**Decisions locked:** clean rebuild of `apps/studio` against `docs/design/polanyi-studio-prototype.html` (old app retired, not evolved) · **vertical-slicing approach confirmed** (per CLAUDE.md/planning skill — each story ships frontend+backend together, not backend-then-frontend) · first slice = Validator + Query Console · v1 ships single-tenant / no-auth, every page **internal-only** until the auth decision is revisited.

**Reference:** `../implementation/02-backend-gap-audit.md` documents real, source-verified backend gaps (no `/api/sparql`, no per-alignment accept/reject, `observability-runtime`/Changes/Evaluations subsystems don't exist yet). Kept as accurate reference for when each story reaches its slice — not a separate execution phase.

**LangChain/LangGraph work:** consult the LangChain documentation MCP server (`mcp__claude_ai_docs_langchain_mcp__*`) for any slice touching `SemanticAgent`, LangGraph, or judge-model wiring (S10 now, Evaluations later) rather than relying on memory.

**Tracking rules:** this file is the single source of truth for progress. One checkbox per story from the story-split; a story is checked only when its slice plan in `../implementation/` is fully executed (all stages RED-GREEN-MUTATE-KILL MUTANTS-REFACTOR complete, verified end-to-end). Update this file in the same commit as the work.

---

## Phase 0 — Setup & wiring

- [x] Story split produced (16 pages → 15 end-to-end child stories + parking lot) — see conversation record / `../implementation/00-story-split.md`
- [x] Ontotext GraphDB MCP confirmed present & is the Ontotext one: `platform/mcp/servers/graphdb` = `mcp-server-graphdb` "MCP server for Ontotext GraphDB via SPARQL" (read-only), wired in `.mcp.json`, `dist/` built. **No install needed** — "install if not present" already satisfied.
- [x] MCP wiring live-checked: `mcp__graphdb__listGraphs` reaches the server; returns 500 because the local **GraphDB instance isn't running** (needs `make up`). Wiring ✓, DB runtime state ✗ — only blocks S4 (SPARQL), not S1–S3.
- [x] Copied v1-relevant vendored Neo4j skills → `.claude/skills/` (cypher, driver-python, nvl, modeling, query-tuning, gds, vector-index, graphrag), all with SKILL.md verified. NVL is the one that matters for S11 (graph viz); cypher/driver-python for S3/S11.
- [x] Databricks skills: decision — NOT copied project-level (already active via user-level plugin `databricks@databricks-agent-skills` 0.2.10; vendored copy stays as reference in `docs/research/vendored-skills/`)
- [x] S1 plan written → `../implementation/01-validator.md` (3 slices: walking skeleton → per-rule ledger → honest edges). New app scaffolds at `apps/studio-v1/` inside Slice-1 of that plan.
- [x] Scaffolded `apps/studio-v1` standalone (own node_modules; NOT yet a root workspace member — keeps old app isolated). Stack: Vite 6, React 18.3, TS 5.7 strict (+noUncheckedIndexedAccess, exactOptionalPropertyTypes), **Vitest 4.1.10 Browser Mode** (Chromium via `@vitest/browser-playwright` factory — vitest 4 API), MSW 2.15, Zod 3.25, Stryker 9.6. Chromium headless launch verified.
- [ ] Decide fate of old `apps/studio` code (keep until parity, then delete; do not delete before)
- [x] **Mutation-testing tooling note**: Stryker's vitest runner does NOT support browser-mode tests (per mutation-testing skill). Manual mutation for browser-only glue; **Stryker stood up for real** against a Node vitest project (`vitest.stryker.config.ts` + `stryker.config.json`) for pure logic — proven in slice 2.

## Phase 1 — Trust core (all backed by existing backend, zero new subsystems)

- [x] **S1. Validate a query against business rules** ← DONE — plan: `../implementation/01-validator.md` (all 3 slices)
  - [x] slice 1 (walking skeleton): paste SQL → real `POST /api/validate` → BLOCKED/PASSED banner.
  - [x] slice 2 (per-rule ledger): pure `verdict.ts` (`overallVerdict`, `ruleRows`) — 3-state verdict, severity→level mapping, names resolved via `GET /api/rules`. Real Stryker: **100% mutation score (45/45 killed)**.
  - [x] slice 3 (honest edges): Validate disabled on empty/whitespace SQL; error panel + working retry on API failure; GUARD-DML renders generically through the same ledger (no special-casing needed); known-limitation note + CLI equivalence line; violating/corrected example presets (exported `VIOLATING_SQL`/`CORRECTED_SQL` for exact-value test assertions).
  - **Final state: 20/20 tests (11 Node + 9 browser), strict typecheck clean, 45 Stryker-killed + 4 manual-killed mutants across the plan, 0 survivors outside the one explicitly-expected/since-fixed case. REFACTOR skipped each slice — code stayed minimal.**
  - Gotcha for later slices: `vitest-browser-react` locators do Playwright substring-match on `getByText`, not TL's exact-by-default — watch for it wherever a name is also a message prefix (matches the real backend's `f"{rule.name}: ..."` format, so it will recur). Second gotcha found in S2-S4: a `<label>` wrapping both static text and a form control gets its computed accessible name concatenated with the control's live value on some engines — anchored exact regexes (`/^sql$/i`) break once the field has content; prefer substring (`/sql/i`).
- [x] **S2. Run a guarded SQL query end-to-end** ← DONE — plan: `../implementation/03-query-console.md`. Backend: `execute_sql()` (new, reuses `validate_sql`) + `POST /api/sql/execute`. Frontend: `SqlTab.tsx` (reuses `verdict.ts`). Found & fixed real a11y gap: `<th>` needs `scope="col"` for reliable `columnheader` role exposure.
- [x] **S3. Run a guarded Cypher query** ← DONE. Backend: `POST /api/graph/query` wraps `Neo4jGraphStore.run_cypher()`, guard-checked before touching Neo4j. Frontend: `CypherTab.tsx`.
- [x] **S4. Run a SPARQL query over glossary + FIBO** ← DONE. Backend: `GraphDBOntologyStore.sparql_query()` (extracted from a real duplication found in the CLI, now shared by both), `POST /api/sparql` (GraphDB when available, live-context pyoxigraph fallback otherwise — CLI refactored onto the same method). Frontend: `SparqlTab.tsx`, honest engine-used label.
- [x] **Integration**: `QueryConsolePage.tsx` (tab-switching, state survives switching tabs) + `AppShell.tsx` (Validator ↔ Query Console nav) wired into `main.tsx` — the app is actually navigable now, not just individually-tested components.
- **Phase 1 final state: 33/33 studio-v1 tests, strict typecheck clean, 119/119 Python tests (started this session at ~95), zero regressions across the whole repo, every new decision point mutation-tested (Stryker where pure-Node-testable, manual elsewhere) with 0 unaddressed survivors.**

## Phase 2 — Govern (read paths, existing backend)

- [x] **S5. Browse the governed glossary** ← DONE — plan: `../implementation/04-glossary.md`. Zero new backend (`GET /api/context`). Real finding: `GlossaryEntry` has **no provenance field** at all — descoped from frontend rather than fabricated (prototype's provenance chips were never backed by real per-term data). "Governing rules" is real derived data: pure `governingRules()` (source_tables ∩ affected_entities), 100% Stryker (5/5 killed). `GlossaryPage.tsx`: table + `TermDrawer`, no inline editing (verified by test — no textbox/edit-button exists). Found gap (noted, not fixed): no error state if `/api/context` fails — hangs on "Loading…" forever, unlike Validator/Query Console which handle this. Wired into `AppShell` as "Semantic Model".
- [x] **S6. Browse declared business rules** ← DONE. Zero new backend (reused `fetchRules()`/`ruleSchema` from S1, already extended with `sql_hints`/`affected_entities` during S5). `RulesPage.tsx`: table + `RuleDetail`, read-only verified by test. Wired into `AppShell` as "Business Rules". 47/47 studio-v1 tests, typecheck clean.
- [x] **S7. Connect a source and browse its schema** ← DONE. Zero new backend (`GET /api/sources` — already redacts credentials server-side via `_redact()`, contradicting an earlier design-review concern about plaintext URIs in the UI; `GET /api/schema`). New `api/schema.ts` client. `SourcesPage.tsx`: sources table + schema browser (table selector, columns with PK/FK labels). Databricks ingestion path correctly deferred (not in this story's scope). Wired into `AppShell` as "Data Sources". 52/52 studio-v1 tests, typecheck clean.
- [ ] **S8. Review the FIBO alignment queue** (read-only: auto / needs-review / rejected)
- [ ] **S8b. Accept or reject an alignment candidate** (write action; gated behind S8)
- [ ] **S9. Ingest a document and see resolved mentions** (incl. SHACL-held failure state)

## Phase 3 — Hero surface

- [ ] **S10. Ask the grounded agent a question** (composer → answer → trace with blocked→self-corrected step; real sessions via memory-runtime)
  - ⚠ HARD DESCOPE: Evidence Packet confidence/calibration + Reasoning-meta resource-allocation panels have ZERO backend — must not ship as static fakes. Descoping is an explicit acceptance criterion of this story.
- [ ] **S11. Explore the knowledge graph — base** ("Full graph" perspective + inspector + Cypher console reuse)
- [ ] **S11b–e. Remaining graph perspectives** (Glossary / Compliance / Documents / Lineage — one follow-up story each; do NOT scope-creep into S11)

## Phase 4 — Admin & shell completion

- [ ] **S12. Browse capability/connector/prompt registry** (read-only)
- [ ] **S13. Settings** (read-only status incl. LLM-optional degradation statement)
- [ ] **S14. Overview dashboard** — LAST (aggregates real data from S1–S13; no placeholder metrics)

## Parking lot (not v1 — each needs its own decision/spike before becoming stories)

- [ ] Changes page (versioning + structural diff + audit store + steward review queue) — new subsystem, own epic
- [ ] Evaluations page — SPIKE FIRST: 5 deterministic rule-enforcement cases through `validate_sql` with stored pass/fail, before committing to the page
- [ ] Activity page — blocked on `packages/observability-runtime` being actually built (currently placeholder)
- [ ] Graph Insights — SPIKE FIRST: is `packages/gnn-runtime` (orphaned NumPy spike, unwired, untested) worth wiring at all vs. real Neo4j GDS? No UI work before that answer
- [ ] RBAC / auth / multi-tenancy — explicit product decision deferred; v1 = internal-only single tenant
- [ ] Real SQL AST parsing for `validate_sql` (current regex word-boundary check documented as known limitation in S1)

## Standing risks (carry into every slice plan)

1. `validate_sql` checks column *presence*, not predicate *correctness* (`packages/execution-runtime/execution/validate.py`) — UI language must not overclaim ("checked" not "proven").
2. Permission-classifier outages intermittently block write-Bash — park commits, retry in 5–25 min.
3. Local GraphDB may still hold pre-rename `urn:graphos:*` graphs until republished.
4. Per-slice process is non-negotiable: load `tdd`, `testing`, `mutation-testing`, `refactoring` before code; RED-GREEN-MUTATE-KILL MUTANTS-REFACTOR per stage; commit approval before every commit.
