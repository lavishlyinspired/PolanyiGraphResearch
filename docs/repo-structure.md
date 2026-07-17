# Repository Structure — review and evolution plan

*Reviewed 2026-07-17 against the proposed monorepo layout (apps/, packages/
with runtime packages, skills/, agents/, workflows/, ontologies/, knowledge/,
connectors/, plugins/, mcp/, infrastructure/, …).*

## Verdict

**As a target-state map: sound. As a restructuring to do now: premature.**
The amendment already made — collapsing 15+ runtime packages into six —
is the right instinct; this review takes it one step further.

The codebase today is one Python package (~15 modules, 97 tests) and one React
app. Splitting that across 20+ workspace packages plus pnpm/turbo tooling
would add import ceremony, version plumbing, and CI overhead without adding a
single capability. Directory structure is not architecture: the boundaries
that matter already exist as module seams inside `graphos`, which is exactly
where they're cheapest to maintain and to refactor.

## The six runtimes already exist as module seams

| Proposed package | Where it lives today |
|---|---|
| `kernel/` (platform services) | `capabilities.py` (registry), `env.py`, `llm.py` |
| `semantic-runtime/` | `introspect.py`, `generate.py`, `prompt.py`, `ontology.py`, `rdf.py`, `owl.py`, `documents.py`, `shapes/` |
| `agent-runtime/` | `agent.py` (LangChain/LangGraph, sessions) — capability + workflow concerns folded in, as amended |
| `execution-runtime/` | guarded tools in `agent.py`/`capabilities.py`, `knowledge_graph.py`, `connectors/databricks/`, `ingest.py` |
| `memory-runtime/` | LangGraph `InMemorySaver` sessions (thin — correctly not a package yet) |
| `observability-runtime/` | `AskResult` reasoning traces (thin — correctly not a package yet) |

`apps/` maps to: `ui/` (studio), `graphos/api.py` (server), `graphos/cli.py`
(cli). At this size, an app is a file, and that is a feature.

## Evolution triggers — split when it hurts, not before

1. **`src/graphos/semantic/` subpackage** — when the semantic modules pass
   ~10 files (they are 8 now). A rename inside one distribution, no packaging
   change. Same later for `graphos/execution/`.
2. **`packages/semantic-runtime` as a separate distribution** — only when an
   external consumer wants the semantic runtime without FastAPI/uvicorn (e.g.
   a LangGraph app embedding it). The signal is a real second consumer, not
   an aesthetic preference.
3. **`apps/server` vs `apps/gateway` vs `apps/worker`** — when a background
   workload exists (scheduled drift detection, bulk document ingestion).
   Today every request is synchronous and short-lived except `/api/ask`.
4. **`skills/` and `agents/`** — when the Capability Registry gains a second
   *kind* of provider package (e.g. vendored Databricks skills executing
   through the registry). Until then, capability providers are code in
   `capabilities.py` and that is the documented extension point.
5. **`pnpm-workspace/turbo`** — when there is a second JS package. There is
   one.

## Worth adopting soon (cheap, real value)

- **`infrastructure/docker/docker-compose.yml`** — GraphDB (+FIBO load),
  Neo4j (+n10s), and `graphos serve` in one `docker compose up`. Onboarding
  currently assumes both stores exist; this is the single highest-leverage
  structural addition. *(Next concrete step.)*
- **`ontologies/mappings/`** — as custom/enterprise ontology mappings appear
  (today FIBO lives in GraphDB and shapes live in-package, which is fine).
- **`prompts/`** — when prompts need governance/versioning beyond the three
  currently inlined next to their use sites.
- Existing `docs/`, `examples/`, `data/`, `notebooks/`, `tools/` already
  match the proposal.

## Explicitly rejected for now

- 15–20 empty runtime/plugin/policy packages ("org-chart architecture").
- `gateway/`, `scheduler/`, `worker/`, `mcp/registry/` with no workload
  behind them.
- Test taxonomy folders (`unit/integration/e2e/benchmark/performance`) —
  97 tests run in ~1s from one flat directory; taxonomy adds navigation cost
  before it adds signal.

## Principle

The GraphOS design rule applies to the repository itself: **deterministic
first, structure under demonstrated pressure**. Every split above has a named
trigger; when a trigger fires, the seam is already in place.
