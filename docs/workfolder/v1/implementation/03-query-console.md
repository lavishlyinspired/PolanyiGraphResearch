# Plan: S2–S4 — Query Console (SQL / Cypher / SPARQL tabs)

**Status**: In progress. **Checklist**: `../checklist/checklist.md` Phase 1.

Real backend gap found (not in the original story-split estimate): `ExecuteSQL`/`RunCypher` existed only as **LangChain/LangGraph agent tools**, reachable solely through `/api/ask` — no direct REST endpoint for "run this one query" existed for any of S2/S3/S4. Building the small endpoint each tab needs, inline in that tab's slice, is the correct vertical-slice horizontal-exception (small, unlocks this slice, verifiable, smaller than doing it inside the slice's own code) — not a violation of the vertical-slicing decision.

## S2 — Run a guarded SQL query end-to-end ✅ DONE

- [x] **Backend**: `execute_sql()` in `packages/execution-runtime/execution/sql.py` — reuses `validate_sql` (zero duplication of the gate), executes via SQLAlchemy on valid, returns structured `{columns, rows}`. New `SqlExecutionResult` model (`packages/common/models.py`). 3 pytest cases (blocked/valid/empty-result-set), manual mutation: guard-inversion KILLED, row-extraction-stub KILLED.
- [x] **Endpoint**: `POST /api/sql/execute` (reuses existing `ValidateRequest` shape). 2 pytest cases. 10/10 `test_api.py` green, 114/114 full-repo regression green.
- [x] **Frontend**: `SqlTab.tsx` — reuses `verdict.ts` for the blocked-ledger path (same knowledge as Validator, not duplicated); results table on pass; "no rows" message on empty pass. 3 browser tests, 2 manual mutants killed. Found & fixed a real a11y gap along the way: `<th>` needs explicit `scope="col"` for Playwright/Chromium to expose `columnheader` role reliably — now fixed in the component, not just worked around in the test. 23/23 studio-v1 tests green, typecheck clean.

## S3 — Run a guarded Cypher query ✅ DONE

- [x] **Backend**: `POST /api/graph/query` wraps `Neo4jGraphStore.run_cypher()` — guard-checked (`guard_cypher`) before ever touching Neo4j, so write-rejection is fast and needs no live connection. 2 pytest cases (guard-live-tested-for-real, success-path monkeypatched since Neo4j is an external service — consistent with the codebase's existing precedent of not unit-testing live driver calls). Manual mutation: guard-condition-inversion KILLED.
- [x] **Frontend**: `CypherTab.tsx` — readable key:value row rendering (not raw JSON dump), rejection message surfaced from the 400 response. 2 browser tests, 1 manual mutant killed.

## S4 — Run a SPARQL query over glossary + FIBO ✅ DONE

- [x] **Backend**: `GraphDBOntologyStore.sparql_query()` — extracted the GraphDB query call that was previously inlined **only** in the CLI's `cmd_sparql` (real duplication found and fixed, not hypothetical). `POST /api/sparql`: GraphDB when configured+available, else `local_sparql` over the **live** in-memory context (`context_to_rdf(context()).serialize()`) — deliberately not the CLI's file-based `--ttl` flag, since the API always has a live context. CLI refactored onto the same shared method (DRY achieved end to end — one implementation, two callers). 3 pytest cases (unit test on `sparql_query` with mocked `httpx.post`; 2 endpoint tests covering both engine paths, the local-fallback one exercising the **real** pyoxigraph path, unmocked). Manual mutation: both branching conditions KILLED.
- [x] **Frontend**: `SparqlTab.tsx` — honest engine-used label ("GraphDB" vs. "local (pyoxigraph)"), the exact mutant that would silently mislabel the engine was killed. 2 browser tests.

## Integration ✅ DONE

- [x] `QueryConsolePage.tsx` — tab-switching container (SQL/Cypher/SPARQL). All three panes stay mounted and toggle via `hidden`, not conditional rendering, so each tab's query and results survive switching away and back (verified by test). 4 browser tests, 2 manual mutants killed.
- [x] `AppShell.tsx` — minimal top-level nav (Validator ↔ Query Console); `main.tsx` now renders it instead of hardcoding one page. Deliberately no router library yet — 2 destinations doesn't warrant one; revisit when more pages land. 2 browser tests, 1 manual mutant killed.

**Final state for the whole S1–S4 slice group: 33/33 studio-v1 tests, strict typecheck clean, 119/119 Python tests (up from 95 at session start), zero regressions, zero uncommitted TDD debt.** Known gap noted, not fixed here: `apps/cli/` has no test harness at all (pre-existing, not introduced by the `cmd_sparql` refactor) — worth its own slice later.
