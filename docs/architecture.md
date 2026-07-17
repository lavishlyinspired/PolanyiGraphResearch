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
   `graphos.semantic.generate.llm_context`).
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
| MCP executor (GraphDB/SPARQL) | 🧩 server vendored, not wired | `platform/mcp/servers/graphdb` |
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
| **Session/Memory Runtime** (multi-turn conversations) | ✅ durable SQLite checkpoints per `session_id`; survive restarts | `packages/memory-runtime` (`graphos.memory`), `session_id` on `POST /api/ask` |
| **Skill plugins** (drop-in capability providers) | ✅ `platform/skills/*/skill.yaml` auto-registered; `agent_tool: true` exposes them to the agent | `graphos/kernel/skills.py`, shipped `fx-conversion` example |

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
   (e.g. `platform/mcp/servers/graphdb`) register the same way.
4. **Sessions (done, v0.1) + reflection.** LangGraph `InMemorySaver` gives each
   `session_id` a multi-turn conversation. Next: durable checkpointers and an
   explicit LangGraph graph (plan → ground → execute → validate → reflect →
   explain).

Each step extends the current modules; none replaces them.

## The Python semantic stack

How the ontology-driven ingestion/reasoning stack maps into GraphOS
(raw discussion: [archive/conversations/readmegpt8-semantic-stack.md](archive/conversations/readmegpt8-semantic-stack.md)):

| Library | Role in GraphOS | Status |
|---|---|---|
| **RDFLib** | `context_to_rdf`: semantic context → RDF. Glossary is a **SKOS vocabulary** (`skos:Concept/prefLabel/definition/altLabel`), entities/relationships/rules use the lightweight `gos:` ontology, FIBO alignments are `skos:exactMatch` links | ✅ `graphos/rdf.py` |
| **pySHACL** | Validate the context RDF against bundled shapes (terms need definitions, severities from the allowed set, relationships need both ends). `graphos publish` refuses SHACL-invalid graphs | ✅ `graphos/shapes/context-shapes.ttl` |
| **GraphDB** | Persistent semantic layer. Context published to the `<urn:graphos:context>` named graph next to FIBO — one SPARQL query joins the enterprise glossary to FIBO definitions. Also the retrieval source for alignment | ✅ `graphos publish`, `graphos sparql`, `POST /api/rdf/publish` |
| **pyoxigraph** | Embedded local SPARQL when GraphDB is absent — same query surface, zero infrastructure (mirrors the LLM-optional principle) | ✅ `local_sparql`, `graphos sparql` fallback |
| **Neo4j (+ n10s later)** | Property-graph projection for analytics/Graph RAG (`graphos materialize`); n10s RDF import/export would sync the two stores | ✅ direct projection; 🔜 n10s |
| **Owlready2** | `OwlReasoner` (`graphos/owl.py`): loads a class's subclass neighborhood exported from GraphDB (or any OWL file), walks ancestors/descendants structurally everywhere, and runs **HermiT inference + consistency checking when a Java runtime is present** — reasoner-optional, same pattern as LLM-optional. `ReasonOWL` capability, `graphos reason`, `GET /api/ontology/reason`. Fast `rdfs:subClassOf*` expansion stays in GraphDB (`ExpandOntology`) | ✅ structural + HermiT-when-Java |
| **SPARQLWrapper / Jena** | Not needed: httpx covers the GraphDB REST/SPARQL protocol; Jena only if Java tooling appears | — |

### Document extraction layer (first slice shipped)

The ingestion pipeline for unstructured sources feeds the same semantic layer:

```
Documents → parse (txt/md/html native; PDF via optional Docling)
          → extract mentions (LLM structured output, heuristic fallback;
            GLiNER/OntoGPT as future optional extractors)
          → resolve to glossary terms (deterministic, same scorer as alignment)
          → RDFLib (gos:Document / gos:Mention with provenance)
          → pySHACL gate → GraphDB <urn:graphos:documents> (append mode)
```

Shipped in `graphos/documents.py` (`graphos ingest-document <path>`,
`POST /api/documents/ingest`). Design constraints carried over from the
structured pipeline: extraction output is **Semantic Concepts first** (not
storage rows), the extractor is **LLM-optional** (heuristic dates/amounts/org
patterns always work), SHACL gates persistence the same way `validate_sql`
gates execution, and every mention keeps `gos:inDocument` provenance.
Documents also project into Neo4j for Graph RAG:
`(:Document)-[:MENTIONS]->(:Mention)-[:REFERS_TO]->(:Term)-[:DESCRIBES]->(:Entity)`
— one Cypher traversal connects a source document to the glossary, FIBO, and
the business entities it talks about. A deterministic glossary scan guarantees
document→term links even when the extractor misses a metric (the glossary is
known; finding its terms is string matching, not model work).
Next: Docling/GLiNER as installed extractor plugins, n10s RDF↔property-graph sync.
