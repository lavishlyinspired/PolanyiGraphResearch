# GraphOS — Semantic Runtime for AI Agents

GraphOS turns the databases you already have into **governed semantic context** that grounds AI agents: a business glossary, entity relationships, and business rules — generated automatically from your schemas, and **enforced symbolically** when agents write SQL.

> One-sentence vision (from [docs/product-vision.md](docs/product-vision.md)):
> *An enterprise semantic runtime that grounds AI agents using metadata, ontologies, and business rules, while using neurosymbolic reasoning to improve correctness, explainability, and trust.*

## Why

AI agents give wrong answers because nobody told them what "Revenue" means, which counterparty is sanctioned, or how `trades` joins to `counterparties`. GraphOS closes that gap:

```
 Database schema ──▶ Introspect ──▶ Semantic Context ──▶ Grounded Agent
 (SQLite/Databricks/    (SQLAlchemy)   glossary            answers with
  any SQLAlchemy URI)                  relationships       the business
                                       business rules      meaning baked in
                                            │
                                            ▼
                                     Symbolic Validator
                              agent SQL is checked against the
                              rules in code — not by the LLM
```

The LLM **reasons**; the symbolic layer **decides**. A query that joins `trades` to `counterparties` without handling `is_sanctioned` is rejected before it runs, and the agent is told why so it can self-correct.

## Quickstart (5 minutes, no cloud required)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

# 1. Ingest the demo financial database (trades, counterparties, risk metrics)
graphos init-demo

# 2. Generate semantic context (works without any API key — deterministic engine;
#    set NVIDIA_API_KEY / OPENAI_API_KEY for LLM-enriched context)
graphos generate

# 3. Inspect what the agent will know
graphos context

# 4. Validate a query against the business rules (no LLM involved)
graphos validate "SELECT * FROM trades t JOIN counterparties c ON t.counterparty_id = c.counterparty_id"
# ✗ BR-001 Sanctioned Counterparty Check: query does not handle is_sanctioned

# 5. Ask a question through the grounded agent (needs an LLM key)
graphos ask "Which counterparties are in high-risk countries?"

# 6. Run the full product: API + GraphOS Studio UI
graphos serve            # http://localhost:8000
```

### With graph backends (optional)

With GraphDB (FIBO) and/or Neo4j running, the semantic layer goes further:

```bash
graphos align                  # align glossary terms with FIBO (LLM ranks ambiguous hits)
graphos rdf                    # context → SKOS/RDF, validated with SHACL (pip install -e ".[semantic]")
graphos publish                # push RDF into GraphDB next to FIBO (skos:exactMatch links)
graphos sparql "..."           # SPARQL via GraphDB, or locally via pyoxigraph without any server
graphos materialize            # project the context into Neo4j (pip install -e ".[graph]")
graphos sync-rdf               # import the context RDF into Neo4j via neosemantics (n10s)
graphos ingest-document <path> # documents → mentions → glossary links → GraphDB + Neo4j
graphos reason [--uri <class>] # OWL hierarchy + HermiT consistency (needs a Java runtime)
```

Once materialized, the agent gains a read-only `query_knowledge_graph` Cypher tool automatically.
Extractor selection: `GRAPHOS_EXTRACTOR=llm|heuristic|gliner` (GLiNER needs `pip install gliner`;
PDF parsing needs `pip install docling`). HermiT reasoning activates automatically when Java
exists (`brew install openjdk` is enough — the Homebrew keg-only path is detected).

### The UI

```bash
cd ui && npm install && npm run dev    # dev mode, proxies /api to :8000
# or: npm run build                    # graphos serve will host ui/dist
```

GraphOS Studio shows data sources, the semantic layer (glossary/ontology view), the knowledge graph, and an agent workspace with the full reasoning trace — including queries that were **blocked by the symbolic validator**.

### Capabilities, not implementations

Agents request capabilities (`ExecuteSQL`, `DiscoverMetadata`, `ValidateSQL`, …) which a registry resolves to concrete providers — Python functions, guarded LangChain tools, and (roadmap) MCP servers and vendor skills. Inspect the catalog at `GET /api/capabilities`; see [docs/architecture.md](docs/architecture.md).

## LLM configuration (optional)

GraphOS works with any OpenAI-compatible endpoint. Set one of:

| Provider | Env vars |
|---|---|
| NVIDIA NIM | `NVIDIA_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Databricks model serving | `DATABRICKS_HOST`, `DATABRICKS_TOKEN`, `DATABRICKS_SERVING_ENDPOINT` |

Override models with `GRAPHOS_PIPELINE_MODEL` / `GRAPHOS_AGENT_MODEL`. Without a key, context generation runs in deterministic mode (schema-derived) and `/api/ask` is disabled.

See [.env.example](.env.example) for everything.

## Using your own database

```bash
graphos generate --db "postgresql://user:pass@host/db" --rules my_rules.json
graphos serve --db "databricks://token:...@host/sql/1.0/warehouses/..."
```

Business rules are declared as JSON (`rule_id`, `name`, `description`, `tables`, `severity`); predicates in descriptions (e.g. `is_sanctioned = TRUE`) become both agent guidance and validation checks. Databricks helpers live in `graphos.connectors.databricks`; `graphos ingest-databricks` pushes the demo dataset to a Unity Catalog schema.

## Repository layout

| Path | What it is |
|---|---|
| `src/graphos/` | The product: introspection, context generation, validation, agent, API, CLI |
| `ui/` | GraphOS Studio (React + Vite) |
| `tests/` | Behavior tests for the semantic runtime |
| `notebooks/` | The original prototype notebook (superseded by the package) |
| `tools/mcp-server-graphdb` | Vendored MCP server for Ontotext GraphDB (SPARQL/FIBO experiments) |
| `docs/architecture.md` | Runtime architecture: semantic/agent/execution split, status map, evolution path |
| `docs/repo-structure.md` | Repository layout review: six-runtime mapping, split triggers, what stays monolithic |
| `docs/product-vision.md` | Product direction & gap analysis distillation |
| `docs/research/` | Market/technology research that informed the product |
| `docs/archive/` | Raw research conversations kept for provenance (not documentation) |
| `Skills/` | Vendored agent-skill repos (Neo4j, Databricks) used during research |

## Roadmap (from the product vision)

1. **Now** — metadata, mappings, glossary, and context generation; symbolic SQL validation.
2. **Next** — ontology alignment (FIBO), SHACL validation, drift detection between schema and context.
3. **Later** — neurosymbolic planning and self-correction; multi-backend materialization (Neo4j/GraphDB).

## Development

```bash
pip install -e ".[dev]"
pytest                       # runs the behavior test suite
cd ui && npm run build       # typecheck + bundle the studio
```
