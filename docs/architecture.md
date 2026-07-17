# GraphOS Architecture

GraphOS is a **semantic orchestration layer on top of LangGraph/LangChain**, not a
new agent framework. The runtime is split into three responsibilities (full
design rationale: [archive/conversations/readmegpt7-three-runtimes.md](archive/conversations/readmegpt7-three-runtimes.md)):

```
                 GraphOS Runtime
                       │
        ┌──────────────┼──────────────┐
        │              │              │
 Semantic Runtime   Agent Runtime   Execution Runtime
    (brain:            (thinking:      (doing:
     what things        planning,       run SQL/Cypher/
     mean)              orchestration)  SPARQL/APIs)
```

- **Semantic Runtime** answers *"What is a Trade? Which rules govern Revenue?
  How does `trades` relate to `counterparties`?"* — this is GraphOS's
  differentiator. Agent frameworks already exist; a reusable semantic runtime
  that grounds any of them does not.
- **Agent Runtime** answers *"What steps, which skills, what order?"* — provided
  by LangGraph/LangChain, deliberately not reinvented.
- **Execution Runtime** answers *"Run this statement on this system"* — thin,
  swappable executors per backend.

## Design principles

1. **Deterministic first, LLM under ambiguity.** Anything derivable from
   metadata (relationships from foreign keys, rule predicates from declared
   rules) is computed in code. The LLM enriches prose and resolves ambiguity;
   it never becomes an architectural dependency.
2. **Declared rules are authoritative.** Business rules are validated
   symbolically (`validate_sql`) — the LLM cannot weaken enforcement, even when
   it rewrites rule prose during context generation (see
   `graphos.generate.llm_context`).
3. **The LLM reasons; the symbolic layer decides.** Agent SQL is checked
   against rules *in code* before execution. Blocked queries return the rule
   text so the agent can self-correct — the neurosymbolic loop.
4. **Capability over implementation (target).** Planners should request
   capabilities (`ExecuteSQL`, `SearchOntology`, `ValidateSHACL`); a registry
   resolves them to skills, MCP servers, tools, or APIs.

## What v0.1 implements today

| Target component | Status | Where |
|---|---|---|
| **Semantic Runtime** | | |
| Semantic Discovery (schema introspection) | ✅ | `graphos/introspect.py` |
| Context Builder + Business Glossary | ✅ deterministic + LLM | `graphos/generate.py` |
| Relationship Discovery (FK-derived) | ✅ | `graphos/generate.py` |
| Context Expansion → agent prompt | ✅ | `graphos/prompt.py` |
| Semantic Validation (rule engine over SQL) | ✅ | `graphos/validate.py` |
| Ontology alignment (FIBO via GraphDB SPARQL) | ✅ precision-first lexical alignment | `graphos/ontology.py`, `graphos align`, `POST /api/context/align` |
| Knowledge Graph Manager (Neo4j materialization) | ✅ | `graphos/knowledge_graph.py`, `graphos materialize`, `POST /api/graph/materialize` |
| Entity Resolution, SHACL, versioning | 🔜 roadmap | — |
| **Agent Runtime** | | |
| ReAct planning/reflection loop | ✅ via LangChain `create_agent` | `graphos/agent.py` |
| Intent analyzer, task decomposer, multi-agent | 🔜 roadmap | — |
| **Execution Runtime** | | |
| SQL executor with symbolic guard | ✅ | `graphos/agent.py` (`build_sql_tools`) |
| Databricks executor + ingestion | ✅ | `graphos/connectors/databricks`, `graphos/ingest.py` |
| MCP executor (GraphDB/SPARQL) | 🧩 server vendored, not wired | `tools/mcp-server-graphdb` |
| Neo4j/Cypher executor (read-only guarded) | ✅ registers as `RunCypher` when `NEO4J_URI` set | `graphos/knowledge_graph.py`, `graphos/capabilities.py` |
| **Capability Runtime** | | |
| Capability Registry (capability → provider resolution) | ✅ initial | `graphos/capabilities.py`, `GET /api/capabilities` |
| Skill / MCP / model / policy registries | 🔜 roadmap | — |
| **Reasoning Runtime** | | |
| Symbolic reasoner (rule checks) | ✅ | `graphos/validate.py` |
| LLM reasoner | ✅ | `graphos/llm.py` |
| Neuro-symbolic fusion (block → self-correct) | ✅ proven end-to-end | `graphos/agent.py` |
| Evidence/confidence/explanation builder | 🧩 partial (reasoning trace) | `AskResult.steps` |
| **Observability** | 🧩 reasoning trace in API/UI | `graphos/api.py`, Studio Agent Workspace |
| **Session Runtime** (multi-turn conversations) | ✅ LangGraph `InMemorySaver`, per-session thread ids | `graphos/agent.py`, `session_id` on `POST /api/ask` |

## Evolution path (no rewrite required)

1. **Capability Registry (done, v0.1).** `graphos/capabilities.py` defines
   `CapabilityProvider` records (name, capability, kind: function/tool/mcp/api,
   metadata) and a `CapabilityRegistry` with `resolve(capability, prefer=...)`.
   `default_registry` registers the built-ins (`DiscoverMetadata`,
   `ValidateSQL`, `ListTables`, `InspectSchema`, `ExecuteSQL` — the last three
   as agent tools, with `ExecuteSQL` behind the symbolic guard). `SemanticAgent`
   now draws its tools from the registry, and `GET /api/capabilities` exposes
   the catalog. New backends register providers; planner/agent code is
   untouched.
2. **Ontology alignment (done, v0.1).** `graphos/ontology.py` searches FIBO
   classes in GraphDB via SPARQL and aligns glossary terms with a
   precision-first lexical score — only exact/inflection matches (≥0.9) attach
   automatically, because "Revenue" must not silently become "revenue bond".
   Prefix/substring hits still rank in `GET /api/ontology/search`. LLM ranking
   of retrieved candidates (never free invention) is the next refinement.
3. **Graph executors (Neo4j done, v0.1).** `graphos/knowledge_graph.py`
   materializes the semantic context into Neo4j (`:Entity`, `:Term`,
   `RELATES_TO`, `DESCRIBES`) and registers a read-only, guarded `RunCypher`
   agent tool. SPARQL executors and MCP servers
   (e.g. `tools/mcp-server-graphdb`) register the same way.
4. **Sessions (done, v0.1) + reflection.** LangGraph `InMemorySaver` gives each
   `session_id` a multi-turn conversation. Next: durable checkpointers and an
   explicit LangGraph graph (plan → ground → execute → validate → reflect →
   explain).

Each step extends the current modules; none replaces them.
