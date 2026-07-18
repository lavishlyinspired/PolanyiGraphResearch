# Studio v1 Rebuild — Master Checklist

**Decisions locked:** clean rebuild of `apps/studio` against `docs/design/polanyi-studio-prototype.html` (old app retired, not evolved) · first slice = Validator + Query Console · v1 ships single-tenant / no-auth, every page **internal-only** until the auth decision is revisited.

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
- [x] **Mutation-testing tooling note**: Stryker's vitest runner does NOT support browser-mode tests (per mutation-testing skill). Decision: manual mutation for browser-only logic this slice; stand up Stryker against a **Node vitest project** in S1-slice-2 where the first pure verdict-derivation function lives.

## Phase 1 — Trust core (all backed by existing backend, zero new subsystems)

- [~] **S1. Validate a query against business rules** ← IN PROGRESS — plan: `../implementation/01-validator.md`
  - [x] slice 1 (walking skeleton): paste SQL → real `POST /api/validate` → BLOCKED/PASSED banner. 2 browser tests green, strict typecheck clean. Manual mutation: verdict-swap KILLED, `!response.ok`-flip KILLED, error-block-removal SURVIVED (error path deferred to slice 3 — expected).
  - [ ] slice 2: per-rule verdict ledger (severity→stamp, passed-with-warnings) + Node/Stryker for pure derivation
  - [ ] slice 3: honest edges (error/retry, empty-disabled, DML guard, limitation note, example presets)
- [ ] **S2. Run a guarded SQL query end-to-end** (Query Console SQL tab)
- [ ] **S3. Run a guarded Cypher query** (Query Console Cypher tab, read-only guard + rejected-write state)
- [ ] **S4. Run a SPARQL query over glossary + FIBO** (GraphDB via MCP/API, pyoxigraph fallback shown honestly)

## Phase 2 — Govern (read paths, existing backend)

- [ ] **S5. Browse the governed glossary** (table + term drawer: provenance, FIBO, lineage, rules) — no inline editing
- [ ] **S6. Browse declared business rules** (table + detail; no create/edit yet)
- [ ] **S7. Connect a source and browse its schema** (sources + schema browser + FK entity map; Databricks ingestion path deferred)
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
