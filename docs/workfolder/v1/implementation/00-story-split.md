# Studio v1 Rebuild — Story Split (source artifact)

Produced via the `story-splitting` skill. Feeds `checklist/checklist.md` (progress tracking) and the per-slice plans in this folder. Full rationale lives in the session record; this is the durable artifact.

## Parent

Semantic-layer stewards and data-platform engineers can **trust, govern, and validate** a semantic-grounded AI agent through a rebuilt Studio UI. "Rebuild 16 pages" is a solution phrase — the split below turns it into independently valuable, end-to-end capabilities, ordered so that everything shipped is backed by real backend, never by aspirational mockups.

## Recommended first slice

**S1 — A steward can paste a SQL query and see which business rules it violates, with the rule text and a fix suggestion, before the query ever runs.**

Why first: the product's core differentiator (LLM proposes, symbols decide); zero new backend (`validate_sql` + `POST /api/validate` exist); demonstrable standalone; burns down the top technical-risk question early (is the regex-based validator acceptable for v1?).

## Split candidates

| # | Slice | Value | Includes | Defers | Acceptance example | Release |
|---|---|---|---|---|---|---|
| S1 | Validate a query against rules | Trust in the symbolic gate | SQL in → per-rule verdicts + rule text + CLI equivalence | SQL AST parser (regex check documented as limitation) | Query joining trades→counterparties w/o `is_sanctioned` → BR-001 BLOCKED with fix guidance | internal-only |
| S2 | Run guarded SQL end-to-end | Real results, not just verdicts | validate → pass → ExecuteSQL → results table | history/saved queries | Passing query → rows render | internal-only |
| S3 | Run guarded Cypher | Direct KG exploration | read-only RunCypher; rejected-write error state | — | MATCH renders rows; write attempt → rejection message | internal-only |
| S4 | SPARQL over glossary+FIBO | "Shared store" story | GraphDB (MCP/API) + pyoxigraph fallback | — | glossary⋈FIBO example query → joined rows | internal-only |
| S5 | Browse glossary | See what the agent knows | table + term drawer (provenance/FIBO/lineage/rules) | definition editing (→ Changes epic) | "Counterparty" drawer shows full record | internal-only |
| S6 | Browse business rules | See what's enforced | table + detail + enforcement history | rule create/edit | BR-001 shows predicate, severity, 30d count | internal-only |
| S7 | Connect source, browse schema | Confirm introspection | sources + schema browser + FK map | Databricks ingestion path | demo.db → 5 tables + FKs render | internal-only |
| S8 | Review FIBO alignment queue | Audit ontology grounding | auto/review/rejected queues, read-only | accept/reject action (→S8b) | "Trade" 0.72 appears under needs-review with LLM candidate | internal-only |
| S8b | Accept/reject alignment | Act on S8 | buttons → real endpoint | bulk actions | Accept → moves to auto-aligned, republishes | internal-only |
| S9 | Ingest document, see mentions | Unstructured → same glossary | full pipeline incl. SHACL-held state | bulk ingestion (worker) | Doc mentioning "counterparty" → resolved mention with provenance | internal-only |
| S10 | Ask the grounded agent | The hero: governed answers with visible why | composer, answer, trace (blocked→corrected), real sessions | **Evidence Packet confidence/calibration + Reasoning-meta panels — zero backend, hard descope** | High-risk question → trace shows block, self-correction, cited answer | internal-only |
| S11 | Knowledge graph base | Visual KG exploration | Full-graph perspective + inspector + Cypher reuse | 4 other perspectives (S11b–e, one story each) | Counterparty neighborhood renders, node click works | internal-only |
| S12 | Registry browse | Runtime transparency | capabilities/connectors/prompts read-only | prompt editing (→ Changes) | ExecuteSQL shows symbolic-guard note | internal-only |
| S13 | Settings | LLM-optional confirmation | read-only status | writing settings from UI | No key → "deterministic mode" stated | internal-only |
| S14 | Overview | Health at a glance | pipeline rail + verdict feed + coverage — built LAST from real data | gap panel / maturity score until backed by data | After S1–S9 ran once, stages show real counts | internal-only |

## Parking lot

Changes epic (versioning/diff/audit/review) · Evaluations (spike first: 5 deterministic cases) · Activity (blocked on observability-runtime) · Graph Insights (spike first: gnn-runtime vs real GDS, wire-or-kill decision) · RBAC/auth/multi-tenancy (product decision; v1 internal-only) · SQL AST validation upgrade.

## Warnings

- S10 is the scope-creep magnet: the visually impressive Evidence Packet/Reasoning-meta panels have no backend. Building them as static fakes repeats the exact failure the achievability audit caught.
- S11: don't let "just add the other perspective tabs" creep back into one PR.
- No slice here is split by technical layer; every row is actor + observable outcome through the real production path.

## Process (per slice, non-negotiable)

Load `planning` → write plan here as `NN-<slice>.md` → before code: load `tdd`, `testing`, `mutation-testing`, `refactoring` → RED-GREEN-MUTATE-KILL MUTANTS-REFACTOR per stage → verify end-to-end → tick `checklist/checklist.md` in the same commit → commit only with approval.
