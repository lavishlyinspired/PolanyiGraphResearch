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
| Ontology Manager / FIBO alignment | 🔜 roadmap | (`tools/mcp-server-graphdb` + OLS4/GraphDB research in `docs/research/`) |
| Entity Resolution, SHACL, semantic memory, versioning | 🔜 roadmap | — |
| **Agent Runtime** | | |
| ReAct planning/reflection loop | ✅ via LangChain `create_agent` | `graphos/agent.py` |
| Intent analyzer, task decomposer, multi-agent | 🔜 roadmap | — |
| **Execution Runtime** | | |
| SQL executor with symbolic guard | ✅ | `graphos/agent.py` (`build_sql_tools`) |
| Databricks executor + ingestion | ✅ | `graphos/connectors/databricks`, `graphos/ingest.py` |
| MCP executor (GraphDB/SPARQL) | 🧩 server vendored, not wired | `tools/mcp-server-graphdb` |
| Neo4j/Cypher executor | 🔜 roadmap | — |
| **Capability Runtime** (registries) | 🔜 next architectural step | — |
| **Reasoning Runtime** | | |
| Symbolic reasoner (rule checks) | ✅ | `graphos/validate.py` |
| LLM reasoner | ✅ | `graphos/llm.py` |
| Neuro-symbolic fusion (block → self-correct) | ✅ proven end-to-end | `graphos/agent.py` |
| Evidence/confidence/explanation builder | 🧩 partial (reasoning trace) | `AskResult.steps` |
| **Observability** | 🧩 reasoning trace in API/UI | `graphos/api.py`, Studio Agent Workspace |
| **Session Runtime** (state, checkpoints) | 🔜 roadmap (LangGraph checkpointers) | — |

## Evolution path (no rewrite required)

1. **Capability Registry (next).** Introduce `Capability` + `Provider` records;
   register today's functions (`introspect`, `generate_context`, `validate_sql`,
   SQL tools) as the first providers. The agent's tools then come from the
   registry instead of being hard-wired in `build_sql_tools`.
2. **Ontology alignment.** Add a FIBO alignment provider (GraphDB/OLS4 lookup +
   LLM ranking of retrieved candidates — never free invention). This upgrades
   glossary entries with `fibo:` classes the Studio UI already visualizes.
3. **More executors.** Neo4j/Cypher and SPARQL executors join SQL behind the
   same validation gate; MCP servers (e.g. `tools/mcp-server-graphdb`) register
   as capability providers.
4. **Session + reflection.** Adopt LangGraph checkpointers for session state;
   promote the ask-loop to an explicit LangGraph graph
   (plan → ground → execute → validate → reflect → explain) once more than one
   executor exists.

Each step extends the current modules; none replaces them.
