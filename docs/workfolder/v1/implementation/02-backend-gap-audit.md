# Backend Gap Audit (evidence-based, not the earlier estimate)

**Why this exists:** the plan pivoted from vertical frontend slices to **backend-complete-first, then frontend** (explicit user decision, overriding the story-splitting/planning skills' default vertical-slice guidance — tradeoff: lose per-story integration feedback, gain no Python/TypeScript context-switching). This audit replaces guesswork with what the source actually contains, checked line by line.

## Confirmed via source read (not inferred from the prototype)

**Full current `apps/server/polanyi/api/__init__.py` endpoint inventory (17 routes):**
`GET /api/health, /api/sources, /api/schema, /api/context, /api/rules, /api/capabilities, /api/ontology/search, /api/ontology/expand, /api/ontology/reason, /api/rdf` · `POST /api/context/generate, /api/validate, /api/ask, /api/documents/ingest, /api/context/align, /api/rdf/publish, /api/graph/materialize`

**Fully backed today (no backend work needed):** S1 Validator, S2 SQL console, S5 Glossary, S6 Rules, S7 Sources/schema, S9 Documents, S10 Agent ask+trace (incl. real session persistence — `packages/memory-runtime/memory/__init__.py`, 37 lines, real), S12 Registry (`/api/capabilities`).

**Small, real gaps (cheap, unblock an existing story each):**
| Gap | Unblocks | What exists | What's missing |
|---|---|---|---|
| No `/api/sparql` endpoint | S4 (SPARQL console tab) | `local_sparql()` in `packages/semantic-runtime/semantic/rdf.py` (pyoxigraph fallback, already tested) + GraphDB query logic **inlined only in the CLI** (`cmd_sparql`, not reusable) | An endpoint; extract CLI's inline GraphDB httpx call into a reusable `GraphDBOntologyStore.sparql_query()` method (DRY — same knowledge, two call sites) |
| No per-alignment accept/reject endpoint | S8b | `POST /api/context/align` runs the *whole* alignment pass and returns an aggregate list | A `POST /api/context/align/{term}/{accept\|reject}` endpoint (or query param) acting on one candidate |
| S3 Cypher console — verify only | S3 | `RunCypher` guarded tool exists in agent runtime | Confirm it's reachable outside the agent (a direct `/api/graph/query` read-only endpoint), or reuse the agent tool path — **decide before coding** |
| S13 Settings — status shape | S13 | `/api/health` exists (`status`, `llm_mode`) | Confirm/extend response to cover backend connectivity (GraphDB/Neo4j) the prototype shows — likely a small addition to `/api/health`, not a new endpoint |
| S11 Knowledge Graph, 5 perspectives | S11b–e | `POST /api/graph/materialize`, RunCypher | Compliance perspective's aggregate enforcement stats and Documents perspective's mention-chain query need dedicated read endpoints or Cypher queries — **scope per perspective when its story starts, not now** |

**New subsystems — confirmed zero code exists (full builds):**
| Subsystem | Unblocks | Evidence checked |
|---|---|---|
| Observability runtime (run-record + cost capture) | Activity page | `packages/observability-runtime/` — **zero `.py` files**, README-only placeholder |
| Changes (version snapshot, structural diff, audit ledger, review queue) | Changes page | grep for audit/version-diff/review-queue across `packages/` + `apps/server` — **no hits** |
| Evaluations (case store, runner, CI gate) | Evaluations page | grep for eval-suite/golden-question/case-store — **no hits**. Per the original story-split: spike first (5 deterministic cases through `validate_sql`) before committing to the full page |
| Graph Insights (`packages/gnn-runtime` wiring decision) | Graph Insights page | confirmed last session: orphaned, not in `pyproject.toml`, no API wiring, hand-rolled NumPy not GDS, no tests — still a wire-or-kill **decision**, not a build, until decided |

## Backend-first execution order

1. **B1 — `POST /api/sparql`** (small, unblocks S4) ← starting here
2. **B2 — alignment accept/reject endpoint** (small, unblocks S8b)
3. **B3 — observability runtime v0**: a run-record store + `/api/runs` — foundational, unblocks Activity and gives every subsequent backend piece (including B4/B5) something real to log into
4. **B4 — Changes subsystem**: version snapshot + structural diff + audit ledger + review queue
5. **B5 — Evaluations spike**: 5 deterministic `validate_sql` cases through a minimal case store; only becomes the full subsystem after the spike answers whether the design holds
6. **Graph Insights decision** — a explicit go/no-go conversation, not scheduled as build work yet

Each item still runs full TDD (pytest, RED-GREEN-MUTATE[manual, no Python mutation harness present]-KILL-REFACTOR) per your CLAUDE.md — the pivot changes *sequencing* (backend-complete before frontend), not *discipline*.

## Explicit note on the vertical-slice tradeoff

Building B3–B5 without a UI consuming them means their API shapes are locked in before any frontend developer/user has clicked through them. Mitigation: keep each subsystem's API surface minimal and additive (easy to extend, hard to accidentally lock in a wrong shape) — one endpoint per read/write need the story split already specified, nothing speculative.
