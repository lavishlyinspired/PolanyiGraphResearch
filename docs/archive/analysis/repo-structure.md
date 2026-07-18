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
that matter already exist as module seams inside `polanyi`, which is exactly
where they're cheapest to maintain and to refactor.

## The runtime split is now the filesystem (implemented 2026-07-17)

The tree was reorganized so the six-runtime map is visible in the layout —
every directory has real content, and each future extraction from the target
structure is a `git mv` from here:

| Proposed | Implemented as |
|---|---|
| `packages/kernel/` | `src/polanyi/kernel/` — `capabilities.py`, `llm.py`, `env.py` |
| `packages/semantic-runtime/` | `src/polanyi/semantic/` — introspect, generate, prompt, ontology, rdf, owl, documents, `shapes/` |
| `packages/agent-runtime/` | `src/polanyi/agents/` — `semantic_agent.py` (capability + workflow concerns folded in, as amended) |
| `packages/execution-runtime/` | `src/polanyi/execution/` — validate, knowledge_graph, ingest, `connectors/databricks/` |
| `packages/memory-runtime/` | LangGraph sessions inside `agents/` (thin — extracts when durable checkpointers land) |
| `packages/observability-runtime/` | `AskResult` traces (thin — extracts when tracing/cost accounting lands) |
| `apps/studio/` | ✅ moved from `ui/` |
| `apps/server/`, `apps/cli/` | `polanyi/api.py`, `polanyi/cli.py` — single files by design at this size |
| root `docker-compose.yml` | ✅ thin include of `infrastructure/docker/docker-compose.yml` |
| `common/`/`shared/` | `polanyi/models.py` |

Still intentionally one installable distribution (`pip install polanyi`) —
the split into separately versioned packages waits for a real second consumer.

## Full target skeleton materialized (2026-07-17, on request)

The complete target layout now exists on disk: `apps/{studio,server,cli,
gateway,worker,scheduler}`, `packages/*` (21), `skills/*` (10), `agents/*`
(10), `workflows/*` (7), `ontologies/*` (9), `knowledge/*` (9), `prompts/`,
`policies/`, `connectors/*` (15), `plugins/*` (7), `mcp/{servers,clients,
registry,transports}`, `infrastructure/{docker,kubernetes,terraform,
monitoring,deployment}`, `config/`, `scripts/`, `tests/{unit,integration,
e2e,benchmark,performance}`, plus root `package.json` (npm workspaces),
`pnpm-workspace.yaml`, and `turbo.json`.

Every directory carries a README stating its purpose, status, and — where
the functionality already exists — the module that currently provides it,
so the scaffold documents intent rather than implying unbuilt capability.
Real content moved to its target home: tests → `tests/unit/`, the vendored
GraphDB MCP server → `platform/mcp/servers/graphdb`, thin app entry points in
`apps/server` and `apps/cli`.

## src/ dissolved into packages/ and apps/ (2026-07-17)

`src/polanyi` no longer exists — the code physically lives where the target
structure says it belongs, while remaining **one installable distribution**
via `package-dir` mapping in the root `pyproject.toml`:

| Import path | Physical location |
|---|---|
| `polanyi` (models, demo) | `packages/common/polanyi/` |
| `polanyi.kernel` | `packages/kernel/polanyi/kernel/` |
| `polanyi.semantic` (+ SHACL shapes) | `packages/semantic-runtime/polanyi/semantic/` |
| `polanyi.agents` | `packages/agent-runtime/polanyi/agents/` |
| `polanyi.execution` (+ connectors) | `packages/execution-runtime/polanyi/execution/` |
| `polanyi.api` | `apps/server/polanyi/api/` |
| `polanyi.cli` (console script) | `apps/cli/polanyi/cli/` |

Imports, the `polanyi` command, `pip install -e .`, Docker, and all 97 tests
are unchanged/verified. The folded-in runtime placeholders
(capability/workflow/prompt/context/reasoning/policy/security/event/
knowledge/plugin/connector/graph/sdk/shared) were removed per the
six-runtime consolidation — `packages/` now holds exactly the six runtimes
plus `common`. Per-package `pyproject.toml` files (separately versioned
distributions) remain the final step, triggered by a real second consumer.

## Top level grouped under umbrellas (2026-07-17)

22 top-level directories were grouped into 12 without deleting anything:

| Umbrella | Contains |
|---|---|
| `platform/` | `skills/ agents/ workflows/ prompts/ policies/ connectors/ plugins/ mcp/` — the extension surfaces |
| `semantics/` | `ontologies/ knowledge/` — semantic assets |
| `research/` | `notebooks/ vendored-skills/` (was root `notebooks/` and `Skills/`) |
| `tools/` | absorbed `scripts/` |

Note: macOS's case-insensitive filesystem had merged the scaffolded lowercase
`skills/` into the vendored `Skills/` on disk — the grouping untangled them
(`platform/skills/` vs `research/vendored-skills/`).

## Final consolidation — six top-level directories (2026-07-17)

| Floating piece | New home |
|---|---|
| `tests/unit/*` | co-located: `packages/*/tests/` and `apps/server/tests/` |
| `tests/{integration,e2e,benchmark,performance}` | `infrastructure/tests/` (cross-cutting suites) |
| `examples/` | `docs/examples/` |
| `research/` (notebooks, vendored-skills) | `docs/research/` |
| `tools/` (+scripts) | `infrastructure/tools/` |
| `config/` | `infrastructure/config/` |
| `data/` (runtime artifacts) | `semantics/knowledge/` — the knowledge tree IS the artifact store: db at its root, contexts in `semantic-models/`, RDF in `rdf/`, ingested docs in `documents/` (CLI/API defaults updated; artifacts gitignored, READMEs tracked) |
| stray `ui/` | removed (it was only a Vite dev-server cache recreated by a process started before the `ui/` → `apps/studio` move) |

Final top level: **`apps/ packages/ platform/ semantics/ infrastructure/ docs/`**
plus root files. pytest discovers the co-located suites via
`testpaths = ["packages", "apps", "infrastructure/tests"]`.

## Evolution triggers — split when it hurts, not before

1. **`src/polanyi/semantic/` subpackage** — when the semantic modules pass
   ~10 files (they are 8 now). A rename inside one distribution, no packaging
   change. Same later for `polanyi/execution/`.
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
  Neo4j (+n10s), and `polanyi serve` in one `docker compose up`. Onboarding
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

The Polanyi Works design rule applies to the repository itself: **deterministic
first, structure under demonstrated pressure**. Every split above has a named
trigger; when a trigger fires, the seam is already in place.
