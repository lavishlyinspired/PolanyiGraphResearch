# Knowledge Graph & Ontology Integration Plan (v4)

**v4 changelog:** re-verified every LangChain multi-agent doc page cited below against the current docs (fetched 2026-07-19, not from memory) and against the current codebase state (post S11b–e). Three corrections that change scope: **(1)** Phase 6's Router rewrite is the wrong pattern for `SemanticAgent` — LangChain's own docs recommend against stateful multi-turn routing, and Polanyi's agent is provably multi-turn (S10 built a whole sessions/checkpointer UI on this). **(2)** Phase 6.1's `RouterState.results` field is missing the `Annotated[list, operator.add]` reducer LangGraph requires for parallel `Send` writes — as written it would crash with `InvalidUpdateError` the first time two runtimes ran in parallel. **(3)** Polanyi's existing `platform/skills/` plugin mechanism (`skill.yaml` + `load_skills()`) is **not** LangChain's progressive-disclosure "Skills" pattern — it's a static tool-registration convention (all `agent_tool: true` skills are bound to the agent from turn one). Routing Phase 1.5/2.4's ontology/graph tools through it would not buy the context savings the plan claims. See "Corrections from v3" below for full detail.

## Problem

`SemanticAgent` answers queries via SQL + one optional Cypher tool. GraphDB ontology capabilities (`SearchOntology`, `ExpandOntology`, `ReasonOWL`) are registered as `kind="function"` — invisible to the agent. Neo4j GDS, vector search, GraphRAG, and GraphDB FTS are all unused.

The skill system under `platform/skills/` is a real, working plugin mechanism (`polanyi.kernel.skills.load_skills`, confirmed by reading the source) but has only one real skill (`finance/fx-conversion/`) — the other eight subdirectories (`graph/`, `ontology/`, `reasoning/`, `retrieval/`, `validation/`, `ingestion/`, `generation/`, `llm/`, `analytics/`) are `README.md`-only category placeholders, explicitly marked `**Status:** reserved — extraction target`.

---

## Corrections from v3 (read this before implementing anything)

### 1. Phase 6 (Router) is the wrong pattern for `SemanticAgent` — do not build it as scoped

Verified against `/oss/python/langchain/multi-agent/router.mdx` directly (not from memory):

> **Stateful routers require custom history management.** ... Consider the **handoffs pattern** or **subagents pattern** instead — both provide clearer semantics for multi-turn conversations.

And from the pattern-comparison table on the same page:

> **Router**: A dedicated routing step... typically doesn't maintain conversation history or perform multi-turn orchestration—it's a preprocessing step. ... Use a **router** when you have clear input categories and want deterministic classification. Use a **supervisor** [subagents] when you need flexible, conversation-aware orchestration.

`SemanticAgent` is not a one-shot classifier — it has a `checkpointer` (built in S10), a session-resume UI (`GET /api/sessions`, `GET /api/sessions/{id}/messages`), and real turn counts surfaced in Studio's Agent Workspace. Rebuilding it as a `StateGraph` router per Phase 6.1 would mean re-implementing multi-turn session persistence at the router level (the docs' own warning), replacing something that already works and is live-verified.

**What to do instead:** if a genuine need for parallel multi-runtime fan-out ever arises (e.g. "compare SQL numbers against the graph's view of the same entity"), use the pattern the router doc itself recommends for stateful contexts — **wrap the stateless router as ONE tool** on the existing conversational agent:

```python
@tool
def cross_check_with_graph(query: str) -> str:
    """Run a query against both SQL and the knowledge graph in parallel and
    report where they agree/disagree. Use only when the user asks to compare
    or reconcile relational and graph views of the same data."""
    result = fanout_workflow.invoke({"query": query})  # the stateless StateGraph from Phase 6.1
    return result["final_answer"]
```

This keeps `SemanticAgent`'s existing checkpointer as the single source of conversational truth and adds the router as an internal implementation detail of one tool — no rewrite, no lost session history. **Defer even this until a concrete question demonstrates SQL-only answers are insufficient.** Do not build Phase 6 speculatively.

### 2. Real bug in the v3 Phase 6.1 code sample: missing reducer

Verified against `/oss/python/langchain/multi-agent/router-knowledge-base.mdx`. The tutorial's actual `RouterState`:

```python
import operator
from typing import Annotated

class RouterState(TypedDict):
    query: str
    classifications: list[Classification]
    results: Annotated[list[AgentOutput], operator.add]  # Reducer collects parallel results
    final_answer: str
```

v3's sample used a bare Pydantic field (`results: list[dict] = []`) with no reducer. When `route_to_agents` fans out via `Send` to multiple nodes in parallel and each returns `{"results": [...]}`, LangGraph raises `InvalidUpdateError: At key 'results': Can receive only one value per step. Use an Annotated key to handle multiple values.` the first time two runtimes are selected together. **If Phase 6 is ever built** (see correction 1 — treat as deferred), the state schema must use the reducer, and note that a bare Pydantic `BaseModel` also needs `Annotated[..., operator.add]` field typing (LangGraph supports Pydantic state schemas, but the reducer mechanism is orthogonal to TypedDict vs. BaseModel).

### 3. Polanyi's `platform/skills/` is not "progressive disclosure" — don't relabel it as such

Read `packages/kernel/skills.py` directly. `load_skills()` runs at `default_registry()` startup, discovers every `skill.yaml`, and for `agent_tool: true` entries wraps the handler with `@tool` immediately — the tool lands in `CapabilityRegistry.agent_tools()`'s flat list and is bound to the agent on every single call from turn one. There is no `load_skill(name)` indirection, no deferred content, no state tracking of "loaded" skills.

This is a genuinely useful mechanism — it gives Polanyi's stated "team distribution" benefit (drop a `skill.yaml` + `handler.py`, no core code changes) — but it does **not** give the "reduces context usage" benefit LangChain's skills-sql-assistant tutorial is built around, because every registered skill's full tool schema/description is sent to the model on every call regardless of relevance. Calling ontology/graph tools "progressive-disclosure skills" (v3 Phase 1.5, 2.4) because they happen to sit in a `skill.yaml` file is mislabeling — it doesn't buy what the label implies.

**What to do instead:**
- **Core, always-relevant capabilities** (ontology search/expand, graph hybrid search, GraphRAG) should be registered directly in `_register_optional_backends()` as `kind="tool"` `CapabilityProvider`s — exactly how `query_knowledge_graph` (Neo4j Cypher tool) is already done today. These aren't optional plugins a third-party team would author independently; they're core to what Polanyi is. Keep them in `capabilities.py`, not `platform/skills/`.
- **Reserve `platform/skills/` for genuinely pluggable, business-specific additions** — the same category `finance/fx-conversion/` is in. No new skill is needed for this initiative (see "Do we need new skills?" below).
- **If tool count later becomes a real problem** (see the "When to revisit progressive disclosure" gate below), build a *real* `load_skill` tool + `SkillMiddleware` (`wrap_model_call`, per the skills-sql-assistant tutorial) as an **additional layer on top of** the existing plugin registry — not a replacement, and not by forcing tools into `skill.yaml` files that don't change how they're bound.

**When to revisit progressive disclosure:** today's tool count is ~5 (`sql_db_list_tables`, `sql_db_schema`, `sql_db_query`, optionally `query_knowledge_graph`, `convert_currency`). Phases 1–4 below add up to ~6 more (`search_ontology`, `expand_ontology`, `search_knowledge_graph`, `run_graph_analytics`, `graph_rag_query`, `query_ontology`), bringing the total to ~11–13. LangChain's docs frame progressive disclosure as valuable at "dozens or hundreds" of tools; 11–13 well-described tools is within normal agent tool-selection range. **Don't build the `load_skill` middleware layer preemptively — revisit only if live usage shows the agent picking the wrong tool at this count**, which is a testable, observable trigger rather than a guess.

### 4. Phase 5.3 (Handoffs state machine for ontology search→expand→reason) — reconsider, likely skip

Verified against `/oss/python/langchain/multi-agent/handoffs.mdx`: the handoffs pattern is for **enforcing sequential constraints in multi-turn, user-facing conversations** ("collecting a warranty ID before processing a refund") — a persistent `current_step` that gates which tools/prompt are active *across conversation turns*.

Ontology exploration (search → maybe expand → maybe reason) is not that: it's optional tool selection *within* the agent's normal reasoning for a single turn, not a multi-turn workflow with distinct user-facing stages. The stated goal ("prevent the agent from running expensive HermiT reasoning when it's just searching") is a **tool-description problem**, not a state-machine problem — solve it by writing `search_ontology`'s and `reason_about_class`'s tool descriptions so the model understands the cost/sequencing convention ("call this only after `search_ontology` has confirmed a specific class URI"), the same way `sql_db_query`'s docstring already tells the model to call `sql_db_list_tables` first. **Recommendation: skip Phase 5.3 as scoped.** If reasoning costs genuinely become a problem in practice (not hypothetically), address it with a cheap per-request rate-limit or cache in `reason_about_class` itself, not a LangGraph state machine.

### 5. Deep Agents — considered, deferred

Every page in this doc set boxes the same tip: *"For built-in multi-agent support, use [Deep Agents](/oss/python/deepagents/overview): a higher-level harness... that ships with subagents, skills, planning, a virtual filesystem, and context management."* Checked `/oss/python/deepagents/overview.mdx`: it's a separate top-level package (`deepagents`, `create_deep_agent(...)`), a different entry point than the plain `langchain.agents.create_agent` `SemanticAgent` is built on.

**Not recommended for this initiative.** Adopting it would mean replacing the already-built, already-live-verified `SemanticAgent` (checkpointer, `AgentStep` reasoning trace surfaced in Studio's Agent Workspace, `on_validation` neurosymbolic hook) with a new harness whose subagent/skills/virtual-filesystem primitives don't map cleanly onto Polanyi's validate-before-execute design. Revisit only if the hand-rolled patterns in Phases 1–4 below prove genuinely unwieldy in practice — not preemptively.

### Do we need new skills?

**No new `platform/skills/` entries for this initiative.** Ontology, graph search, GDS, and GraphRAG are core Polanyi capabilities (correction 3 above) and belong in `capabilities.py` directly, matching how Neo4j's `query_knowledge_graph` is already registered. The existing `finance/fx-conversion/` skill remains the only real example of what the plugin mechanism is *for* — a genuinely optional, business-specific addition. A new skill would only make sense for a future concrete ask matching that shape (e.g. a vertical-specific calculation), not for foundational graph/ontology tooling.

---

## Key LangChain Multi-Agent Patterns (re-verified 2026-07-19 against docs.langchain.com, not memory)

### 1. Skills (progressive disclosure)
A single agent stays in control; a lightweight `load_skill` tool + `SkillMiddleware` (`AgentMiddleware.wrap_model_call`, or the simpler `@wrap_model_call` function decorator) injects short skill *descriptions* into the system prompt, and the agent calls `load_skill(name)` to pull full content into context only when needed. This is genuinely a context-window optimization; Polanyi's `skill.yaml` mechanism is a different (also useful) thing — see correction 3.

### 2. Router (parallel fan-out)
A `classify_query` node using `model.with_structured_output(...)` determines which specialized agents to consult; `route_to_agents` returns `list[Send(node_name, partial_state)]`, LangGraph fans out to those nodes in parallel; a `synthesize` node merges results. **Stateless by design** — the docs explicitly discourage this for multi-turn conversational agents (correction 1). State fields that parallel nodes write into need an `Annotated[..., operator.add]` reducer (correction 2).

### 3. Subagents (Supervisor pattern)
Workers are plain `create_agent(...)` instances wrapped as `@tool` functions (`result["messages"][-1].content` returned), registered on a supervisor's tool list. Supervisor stays stateful (has the checkpointer); subagents are stateless per-call (fresh context each invocation) — this is the actual multi-turn-safe way to add specialized workers. Two sub-patterns: **tool per agent** (fine control) vs. **single dispatch tool** (`task(agent_name, description)`, better for many/growing agent registries via `list_agents`-style tool-based discovery).

### 4. Handoffs (State machine)
Single agent (or graph of agents) whose config (system prompt + tools) changes based on a **persistent, cross-turn** state variable, transitioned via tool calls returning `Command(update={...})`. Two implementations: single-agent-with-middleware (`@wrap_model_call` reads `request.state["current_step"]`, calls `request.override(system_prompt=..., tools=...)`) or multi-subgraph (`Command(goto=..., graph=Command.PARENT)`). Best for genuinely sequential, user-facing conversational stages — not for optional/parallel tool selection within one turn (correction 4).

### 5. Dynamic Tool Registration
A tool marked "requires skill X" checks `runtime.state.get("skills_loaded", [])` and returns an error string telling the model to load the prerequisite skill first — a **soft gate** (the tool schema is still always bound/visible; only its *execution* is gated). True removal of a tool from what's sent to the model requires the middleware `request.override(tools=...)` mechanism from the handoffs pattern, not this one.

### 6. ToolRuntime + Command
Tools accept a `runtime: ToolRuntime` parameter (gives access to `runtime.state`, `runtime.tool_call_id`) and can return `Command(update={...})` instead of a plain string to mutate agent state (e.g. `skills_loaded`, `current_step`) as a side effect of being called. Any tool returning `Command` that also emits a message **must** include a matching `ToolMessage(tool_call_id=runtime.tool_call_id)` in the update, or the conversation history becomes malformed (documented gotcha, both handoffs.mdx and skills-sql-assistant.mdx call this out explicitly).

---

## How This Applies to Polanyi

| Pattern | Where It Fits | Status |
|---|---|---|
| **Direct tool registration** (not "skills") | Ontology search/expand, hybrid graph search, GDS, GraphRAG — register in `capabilities.py` like `query_knowledge_graph` already is | Phases 1, 2, 3, 4 |
| **Subagents** | GraphRAG's retrieval+LLM loop wrapped as one tool (`neo4j-graphrag`'s `GraphRAG.search()` already *is* a self-contained loop, even though it's not a `create_agent(...)` instance) | Phase 4 |
| **Handoffs** | Reconsidered — likely unnecessary for ontology workflow (correction 4); genuinely fits if a real multi-turn, user-facing staged workflow appears later | Deferred, not scheduled |
| **Progressive Disclosure (real)** | Deferred until tool count or usage data justifies it (correction 3's gate) | Deferred, not scheduled |
| **Router** | Deferred; if ever needed, as one internal tool wrapping a stateless workflow, not a `SemanticAgent` rewrite (correction 1) | Deferred, not scheduled |

**Current architecture note:** `build_agent_prompt()` loads the full glossary/rules/entities upfront into the system prompt. This is fine at Polanyi's current scale (44 terms, 5 rules, 7 tables) — real progressive disclosure of *this* content would only matter if the semantic context grew by an order of magnitude. Not in scope here.

---

## Phase 1: Quick Wins (P0)

### 1.1 Enrich Agent Prompt with Ontology Data

**File:** `packages/semantic-runtime/semantic/prompt.py` (currently ~45 lines; `build_agent_prompt()` iterates `ctx.glossary` around line 20)

Append `ontology_class`/`ontology_uri` per glossary entry so the agent can cite FIBO alignment when relevant:

```python
if entry.ontology_class:
    lines.append(f"  Ontology: {entry.ontology_class}")
    lines.append(f"  FIBO URI: {entry.ontology_uri}")
```

**~2 lines. No deps. TDD**: extend `packages/semantic-runtime/tests/test_prompt.py` with a case asserting the FIBO line appears for an aligned term and is absent for an unaligned one (never fabricate the line for `ontology_class is None`).

### 1.2 Promote Ontology Functions to Agent Tools

**File:** `packages/kernel/capabilities.py`, inside `_register_optional_backends()`'s `if graphdb_configured():` block (currently registers `SearchOntology`/`ExpandOntology`/`ReasonOWL` as `kind="function"`, lines ~142–185)

Change `SearchOntology` and `ExpandOntology` to `kind="tool"`, matching the existing `query_knowledge_graph` pattern exactly (same file, `if neo4j_configured():` block):

```python
from langchain.tools import tool

@tool
def search_ontology(term: str) -> str:
    """Search FIBO ontology classes in GraphDB by business term.
    Returns matching ontology classes with labels, definitions, and scores."""
    return str(store.search_classes(term))

@tool
def expand_ontology(uri: str) -> str:
    """Expand an ontology class URI to all its transitive subclasses via rdfs:subClassOf*."""
    return str(store.expand_subclasses(uri))
```

Register with `kind="tool"` (keep `ReasonOWL` as `kind="function"` for now — it's the expensive HermiT path; see correction 4 on why a state machine isn't needed to gate it, just don't expose it as a tool yet until there's a concrete need for the agent to call it directly rather than via the Studio Ontology page's existing UI).

**~25 lines. No deps. TDD**: extend `packages/kernel/tests/test_capabilities.py` — assert `search_ontology`/`expand_ontology` appear in `registry.agent_tools()` when GraphDB is configured, and assert they do NOT appear when unconfigured (mirrors the existing Neo4j-configured/unconfigured test pairs in that file).

### 1.3 Refresh Cypher Tool Description Dynamically

**File:** `packages/kernel/capabilities.py`, `query_knowledge_graph`'s docstring (currently static, hardcodes `(:Entity {name})`, `(:Term {term, definition, ontology_class})` node shapes)

Query `CALL db.labels()` / `CALL db.relationshipTypes()` once at tool-creation time (inside `_register_optional_backends`, where `neo4j_configured()` is already true and a driver connection is already being made) to embed the real live schema, so the description stays accurate as Document/Mention nodes get added by materialization (already real since S11d):

```python
def _describe_graph_schema(store: Neo4jGraphStore) -> str:
    try:
        labels = [r["label"] for r in store.run_cypher("CALL db.labels() YIELD label RETURN label")]
        rel_types = [r["relationshipType"] for r in store.run_cypher("CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType")]
        return f"Node labels: {', '.join(labels)}. Relationship types: {', '.join(rel_types)}."
    except Exception:
        return "Schema unavailable."
```

**~20 lines. No deps. TDD**: `test_capabilities.py` — fake store returning known labels/rel types, assert the tool's `.description` string contains them.

### 1.4 Graceful Degradation When Graph Empty

**File:** `packages/kernel/capabilities.py`

If `MATCH (n) RETURN count(n) AS c` returns 0 (Neo4j reachable but never materialized — a real, already-observed state before the first `/api/graph/materialize` call), the `query_knowledge_graph` tool should say so plainly rather than the agent silently getting empty Cypher results and guessing why.

**~15 lines. No deps. TDD**: mock store with `count(n) = 0`, assert tool output mentions materializing.

---

## Phase 2: Neo4j Vector + Fulltext Search (P1)

### 2.1 Add Schema Indexes to `Neo4jGraphStore`

**File:** `packages/execution-runtime/execution/knowledge_graph.py`

```python
def ensure_indexes(self) -> None:
    with self._driver.session() as session:
        session.run("""
            CREATE VECTOR INDEX term_embedding IF NOT EXISTS
            FOR (t:Term) ON (t.embedding)
            OPTIONS {indexConfig: {
                `vector.dimensions`: 768,
                `vector.similarity_function`: 'cosine'
            }}
        """)
        session.run("""
            CREATE FULLTEXT INDEX term_fulltext IF NOT EXISTS
            FOR (t:Term) ON EACH [t.term, t.definition]
        """)
```

Call at the end of `materialize()` when any terms were written (already returns `{"entities": n, "terms": n, "relationships": n}` — gate on `terms > 0`).

**~30 lines. No deps. TDD**: extend `packages/execution-runtime/tests/test_knowledge_graph.py` with a fake-driver-session test asserting `ensure_indexes` issues both `CREATE ... IF NOT EXISTS` statements; assert `materialize()` calls it only when `terms > 0`.

### 2.2 Store Embeddings on Terms During Materialization

**File:** `packages/execution-runtime/execution/knowledge_graph.py`

Reuse `LocalEmbeddingProvider` from `packages/semantic-runtime/semantic/embeddings.py` (already used for FIBO alignment's embedding index — confirmed real, not speculative) — guard-import so materialize still works when `sentence-transformers` isn't installed (matches the project's LLM-optional/embeddings-optional posture already established for `resolve_embedding_provider()`):

```python
try:
    from polanyi.semantic.embeddings import LocalEmbeddingProvider
    provider = LocalEmbeddingProvider()
    embeddings = provider.embed([f"{g.term}: {g.definition}" for g in context.glossary])
    with self._driver.session() as session:
        for entry, emb in zip(context.glossary, embeddings):
            session.run("MATCH (t:Term {term: $term}) SET t.embedding = $embedding",
                       {"term": entry.term, "embedding": emb})
except ImportError:
    pass
```

**~20 lines. Optional dep already present: `sentence-transformers` under `polanyi-works[embeddings]`.** TDD: assert embeddings are written when the provider is importable (mock it), assert `materialize()` degrades silently (no exception, terms still written) when it's not.

### 2.3 Add Hybrid Search Tool

**File:** `packages/kernel/capabilities.py` — register directly (correction 3), not as a `platform/skills/graph/` entry

```python
@tool
def search_knowledge_graph(query: str, top_k: int = 5) -> str:
    """Semantic + lexical search over the enterprise knowledge graph.
    Finds Term nodes matching `query` by meaning (vector) and text (fulltext)."""
```

Query vector index (`db.index.vector.queryNodes`) and fulltext index (`db.index.fulltext.queryNodes`) in the same Neo4j session, merge by `term`, rank by combined score.

**~50 lines. No deps beyond 2.2's. TDD**: fake driver session returning canned vector+fulltext hits, assert merged/deduped/ranked output; assert honest "no embedding index" message when `ensure_indexes`/2.2 haven't run yet (don't fabricate results).

---

## Phase 3: Graph Data Science Algorithms (P1)

### 3.1 Install `graphdatascience`

Add to `[project.optional-dependencies]` in `pyproject.toml` (confirmed: not currently present — only `graph = ["neo4j>=5.0"]` exists today).

### 3.2 Create GDS Wrapper

**File:** `packages/execution-runtime/execution/gds_tools.py` (new)

Each function: project → run → stream results → drop projection in a `finally` block (GDS in-memory graph projections must be explicitly dropped or they leak JVM heap across calls — this is a real GDS operational requirement, not speculative).

```python
def page_rank(store: Neo4jGraphStore, top_n: int = 10) -> str: ...
def find_communities(store: Neo4jGraphStore) -> str: ...
def find_similar_terms(store: Neo4jGraphStore) -> str: ...
```

**Note on `packages/gnn-runtime`:** confirmed via direct read (1009 lines across `anomaly.py`, `link_prediction.py`, `router.py`, `insights.py`) that this package is never imported by `capabilities.py` or the API — genuinely orphaned, not a duplicate-effort risk for this GDS wrapper (GDS runs server-side in Neo4j via the `graphdatascience` Python client; `gnn-runtime` is a separate NumPy-based spike). Whether `gnn-runtime` is worth reviving is the existing parking-lot "Graph Insights" item's question, independent of this plan.

**~150 lines. New dep: `graphdatascience>=1.22`.** TDD: since GDS requires the Neo4j GDS plugin (not guaranteed present even when Neo4j itself is configured), gate registration on a runtime capability check (`CALL gds.version()` or similar) the same way `neo4j_configured()` gates the base Cypher tool — write a test asserting the tool is absent when GDS isn't installed server-side, not just when Neo4j is unreachable.

### 3.3 Register Directly (No Dynamic Gating Needed)

Given correction 3 (skip premature progressive disclosure) and correction 4's reasoning (tool descriptions over state machines for optional, single-turn tool selection), register GDS tools the same way as everything else in `_register_optional_backends()`, gated on the GDS-plugin-present check from 3.2 — no `ToolRuntime`/`Command`/`skills_loaded` machinery needed. If GDS tool descriptions alone prove insufficient to stop the agent from calling expensive algorithms inappropriately (observed in practice, not hypothesized), *then* revisit the dynamic-gating idea from v3 — but don't build it speculatively.

**~10 lines (just the registration + gating check).**

---

## Phase 4: GraphRAG Pipeline (P2)

### 4.1 Install `neo4j-graphrag`

Add to `[project.optional-dependencies]` in `pyproject.toml` (confirmed: not currently present).

### 4.2 Create GraphRAG Sub-Agent

**File:** `packages/execution-runtime/execution/graphrag_pipeline.py` (new)

Uses `HybridCypherRetriever` + `GraphRAG` from `neo4j-graphrag`. This genuinely matches the **subagents** pattern's spirit even though it's not built from `langchain.agents.create_agent(...)` — `neo4j_graphrag.GraphRAG.search()` is itself a self-contained retrieval+generation loop, wrapped as one tool the same way the docs wrap a `create_agent(...)` instance:

```python
def graph_rag_query(question: str) -> str:
    """Answer questions using the enterprise knowledge graph with GraphRAG.
    Searches glossary terms semantically + lexically, follows entity relationships."""
    from neo4j_graphrag.retrievers import HybridCypherRetriever
    from neo4j_graphrag.llm import OpenAILLM
    ...
```

**~80 lines. New dep: `neo4j-graphrag>=1.16`.** TDD: mock the retriever/LLM boundary, assert the tool degrades honestly (clear message, not a fabricated answer) when Neo4j's vector/fulltext indexes from Phase 2 aren't present yet.

### 4.3 Register Directly

Register in `capabilities.py` per correction 3 — no `platform/skills/graph/graphrag/` needed.

---

## Phase 5: GraphDB Advanced Features (P2)

### 5.1 GraphDB Full-Text Search (Lucene)

**File:** `packages/semantic-runtime/semantic/ontology.py` (the `_candidates_for`/lexical-search path, currently `FILTER(CONTAINS(LCASE(STR(?label)), "{token}"))`)

Replace with Lucene FTS:

```sparql
PREFIX luc: <http://www.ontotext.com/owlim/lucene#>
?label luc:fts "$token"
```

Faster on ~3000 FIBO classes, free in GraphDB Free (no Enterprise license needed — confirmed, this is a GraphDB-Free-tier feature).

**~10 lines changed. No deps. TDD**: existing `test_ontology.py` alignment tests should still pass unchanged (behavior-preserving performance change) — add one test asserting Lucene syntax appears in the generated SPARQL when FTS is used.

### 5.2 SPARQL Agent Tool

**File:** `packages/kernel/capabilities.py`

```python
@tool
def query_ontology(sparql: str) -> str:
    """Run read-only SPARQL against the FIBO ontology repository on GraphDB."""
```

Guard with the same read-only check pattern as `guard_cypher()` (reject `INSERT`/`DELETE`/`UPDATE` in the SPARQL text) — GraphDB SPARQL endpoints can execute updates if not restricted.

**~20 lines (15 tool + 5 guard). No deps.** TDD: assert a write-shaped SPARQL string is rejected before reaching GraphDB, mirroring `test_knowledge_graph.py`'s `guard_cypher` tests.

### 5.3 ~~Ontology Workflow with Handoffs Pattern~~ — Skipped (correction 4)

See correction 4 above. Not scheduled.

GraphDB MCP remains deferred (requires Enterprise license for GraphDB 11 — unchanged from v3).

---

## Phase 6: Multi-Runtime Fan-out — Deferred, Not Scheduled

See correction 1. Do not build a `StateGraph` router replacing `SemanticAgent`. If a concrete need for cross-runtime comparison appears later, implement it as a single stateless-workflow-wrapped tool (per the router doc's own "Stateful > Tool wrapper" guidance), keeping `SemanticAgent`'s checkpointer as the only stateful conversation layer. If that day comes, use the corrected `RouterState` with `Annotated[list, operator.add]` (correction 2) — do not copy the v3 sample verbatim.

---

## Summary: Corrected Pattern Coverage

| Phase | Pattern | Files Changed | Effort | Status |
|---|---|---|---|---|
| 1.1 | — (prompt enrichment) | `prompt.py` | 2 lines | Ready |
| 1.2 | Direct tool registration | `capabilities.py` | 25 lines | Ready |
| 1.3 | Dynamic tool description | `capabilities.py` | 20 lines | Ready |
| 1.4 | Graceful degradation | `capabilities.py` | 15 lines | Ready |
| 2.1–2.2 | Index + embedding storage | `knowledge_graph.py` | 50 lines | Ready |
| 2.3 | Direct tool registration | `capabilities.py` | 50 lines | Ready (needs 2.1–2.2) |
| 3.1–3.3 | Direct tool registration (no dynamic gating) | `gds_tools.py` (new) | 160 lines | Ready |
| 4.1–4.3 | **Subagent** (self-contained retrieval+LLM loop wrapped as tool) | `graphrag_pipeline.py` (new) | 80 lines | Ready (needs 2.1–2.2) |
| 5.1–5.2 | Direct tool registration | `ontology.py` + `capabilities.py` | 30 lines | Ready |
| 5.3 | ~~Handoffs~~ | — | — | Skipped (correction 4) |
| 6 | ~~Router~~ | — | — | Deferred (correction 1) |
| Progressive disclosure (real) | Skills + middleware | — | — | Deferred (correction 3's gate) |

## Implementation Order

1. **Phase 1.1** — prompt enrichment, 2 lines, highest per-line impact
2. **Phase 1.2** — ontology → tool, agent can now query FIBO directly
3. **Phase 1.3 + 1.4** — better tool descriptions, graceful empty-graph handling
4. **Phase 2.1 + 2.2** — indexes + embeddings, prerequisite for search and GraphRAG
5. **Phase 2.3** — hybrid search tool
6. **Phase 3** — GDS tools (direct registration, no dynamic gating)
7. **Phase 4** — GraphRAG (as a subagent-style tool)
8. **Phase 5.1 + 5.2** — GraphDB FTS + SPARQL tool

Each phase is independently shippable with working tests (TDD: RED failing test → minimal GREEN → mutation-test the pure logic → live-verify against real GraphDB/Neo4j, matching the discipline used throughout S8c–S11e). Phase 5.3 and Phase 6 are explicitly not scheduled — revisit only against concrete evidence, not speculatively.

See `platform/skills/finance/fx-conversion/` for the one real example of the plugin pattern; no new skill is needed for this plan (see "Do we need new skills?" above).
