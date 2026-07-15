# Ontology Database MCP Servers, Agent Skills & SDKs

Comprehensive listing of MCP servers, AI agent integrations, and SDKs for ontology/RDF databases.

---

## MCP Servers by Database

### Ontotext GraphDB

#### 1. Built-in MCP Server (Official, since GraphDB v11.3)
- **Type**: First-party, built into GraphDB
- **Transport**: Streamable HTTP (`/mcp` endpoint) + SSE backward compatibility
- **Docs**: https://graphdb.ontotext.com/documentation/11.4/using-graphdb-llm-tools-with-external-clients.html

**Exposed LLM tools:**
- SPARQL query (per-repository)
- Similarity search (vector-based semantic search)
- Full-text search
- Retrieval search
- IRI discovery
- Ontology schema extraction
- Repository listing

**Configuration example (YAML):**
```yaml
acmeConfig:
  repositoryId: "acme"
  tools:
    sparql_query:
      enabled: true
      ontologyGraph: "http://example.com/acme"
    similarity_search:
      enabled: true
      similarityIndex: "myIndex"
      resultThreshold: 0.6
    fts_search:
      enabled: true
      limit: 10
```

**MCP gateway**: For older stdio-only clients, a middleware `mcp-gateway` converts stdio to http/sse.

**Dify integration**: OpenAPI spec exposed at `/rest/llm` for Dify framework compatibility.

#### 2. mcp-server-graphdb (Community, read-only)
- **GitHub**: https://github.com/keonchennl/mcp-graphdb
- **Stars**: 15
- **License**: GPL v3
- **Language**: Node.js

**Tools:**
- `sparqlQuery` -- Execute SPARQL queries (read-only)
- `listGraphs` -- List all named graphs

**Resource views:**
- `graphdb:///repository/{repo}/classes` -- Class list with counts
- `graphdb:///repository/{repo}/predicates` -- Predicates with usage counts
- `graphdb:///repository/{repo}/stats` -- Triple counts
- `graphdb:///repository/{repo}/sample` -- Sample triples
- `graphdb:///repository/{repo}/graph/{graph}` -- Graph-specific content

**Configuration:**
```json
{
  "mcpServers": {
    "graphdb": {
      "command": "node",
      "args": ["/path/to/mcp-server-graphdb/dist/index.js"],
      "env": {
        "GRAPHDB_ENDPOINT": "http://localhost:7200",
        "GRAPHDB_REPOSITORY": "myRepository",
        "GRAPHDB_USERNAME": "username",
        "GRAPHDB_PASSWORD": "password"
      }
    }
  }
}
```

---

### Stardog

#### 1. stardog-cloud-mcp (Official)
- **GitHub**: https://github.com/stardog-union/stardog-cloud-mcp
- **Stars**: 2
- **Transport**: stdio (local) + HTTP (remote, beta)

**Tools:**
- `voicebox_settings` -- Get Voicebox app configuration
- `voicebox_ask` -- Natural language questions with full-context answers (reasoning chain, SPARQL queries, provenance)
- `voicebox_generate_query` -- Generate SPARQL from natural language

**Requirements**: Python >=3.12, uv, Stardog Cloud API Token

**Local config (Claude Desktop):**
```json
{
  "mcpServers": {
    "stardog-cloud-mcp": {
      "command": "uv",
      "args": [
        "--directory", "/path/to/stardog-cloud-mcp",
        "run", "stardog-cloud-mcp",
        "--token", "your_api_token",
        "--client_id", "your_app_id"
      ]
    }
  }
}
```

**Remote config (Cursor):**
```json
{
  "mcpServers": {
    "vbx-cloud-mcp": {
      "url": "http://0.0.0.0:7001/mcp",
      "headers": {
        "x-sdc-api-key": "your_api_token",
        "x-sdc-client-id": "your_client_id"
      }
    }
  }
}
```

#### 2. mcp-server-stardog (Community)
- **GitHub**: https://github.com/noahgorstein/mcp-server-stardog
- **Language**: Python (uv)

**Tools:**
- `list_databases` -- List all Stardog databases
- `get_database_config` -- Get database configuration
- `execute_sparql_read` -- Execute SELECT/CONSTRUCT/DESCRIBE/ASK queries
- `assign_role_to_user` -- Assign roles
- `get_whoami` -- Current user info

**Config (VS Code):**
```json
{
  "mcp": {
    "servers": {
      "stardog": {
        "type": "stdio",
        "command": "uv",
        "args": ["--directory", "/path/to/mcp-server-stardog", "run", "mcp-server-stardog"],
        "env": {
          "SD_USERNAME": "${env:SD_USERNAME}",
          "SD_PASSWORD": "${env:SD_PASSWORD}",
          "SD_ENDPOINT": "${env:SD_ENDPOINT}"
        }
      }
    }
  }
}
```

#### 3. Stardog REST MCP Adapter
- **Source**: https://mcp-hub.ink/servers/stardog/
- **Type**: REST-based tool/context discovery

**Endpoints:**
- `GET /mcp/tools` -- List registered tools
- `POST /mcp/tools` -- Register/update a tool
- `POST /mcp/context` -- Request assembled context for a query
- `GET /health` -- Health check

**Features:**
- Semantic retrieval + vector/embedding integration
- Provenance, source citations, metadata in responses
- Docker deployment
- Basic auth / token support

---

### Amazon Neptune

#### 1. amazon-neptune-mcp-server (AWS Official)
- **GitHub**: https://github.com/awslabs/mcp
- **Package**: `awslabs.amazon-neptune-mcp-server`
- **Transport**: stdio, Docker

**Tools:**
- Run openCypher and/or Gremlin queries
- Schema discovery
- Status checks

**Config:**
```json
{
  "mcpServers": {
    "Neptune Query": {
      "command": "uvx",
      "args": ["awslabs.amazon-neptune-mcp-server@latest"],
      "env": {
        "NEPTUNE_ENDPOINT": "neptune-db://your-endpoint"
      }
    }
  }
}
```

**Endpoint formats:**
- Neptune Database: `neptune-db://`
- Neptune Analytics: `neptune-graph://`

#### 2. Neptune Memory MCP Server
- **GitHub**: https://github.com/aws-samples/amazon-neptune-generative-ai-samples/tree/main/neptune-mcp-servers/neptune-memory
- **Purpose**: Persistent memory knowledge graph for MCP-enabled agents

---

### Apache Jena Fuseki

#### mcp-jena
- **GitHub**: https://github.com/ramuzes/mcp-jena
- **Language**: Node.js

**Tools:**
- `execute_sparql_query` -- SPARQL queries with syntax documentation
- `execute_sparql_update` -- SPARQL update operations
- `list_graphs` -- List named graphs
- `sparql_query_templates` -- Pre-built templates (exploration, property-paths, statistics, validation, schema)

---

### Generic SPARQL (Works with Any Endpoint)

#### 1. rareba/sparql-mcp
- **GitHub**: https://github.com/rareba/sparql-mcp
- **Transport**: Streamable HTTP
- **Works with**: GraphDB, Stardog, Blazegraph, Virtuoso, Fuseki, Neptune, AllegroGraph, Oxigraph, Wikidata, DBpedia

**Tools:**
- `sparql_query_tool` -- Generic SPARQL query
- `list_endpoints_tool` -- Built-in + user endpoints
- `describe_resource_tool` -- DESCRIBE
- `list_classes_tool` -- Distinct rdf:type values
- `list_predicates_tool` -- Most-used predicates
- `list_named_graphs_tool` -- Named graphs
- `sample_of_type_tool` -- Sample instances
- `get_prefixes_tool` -- Known prefixes
- LINDAS-specific helpers (cubes, datasets, agents)
- `parse_rdf_tool`, `serialize_graph_tool` (optional `rich` extra)

**Config** (optional, `~/.config/sparql-mcp/endpoints.toml`):
```toml
[[endpoints]]
label = "MyGraphDB"
url = "http://localhost:7200/repositories/myrepo"
```

#### 2. sib-swiss/sparql-mcp
- **GitHub**: https://github.com/sib-swiss/sparql-mcp
- **Transport**: MCP over HTTP (`/mcp`)
- **Purpose**: SPARQL query generation from natural language for open-access endpoints

**Tools:**
- `access_sparql_resources` -- Relevant query examples and schema
- `get_resources_info` -- Endpoint metadata
- `execute_sparql` -- Execute against a given endpoint

---

## Ontology Engineering MCP Servers

### OntoLoom (OWL 2 Ontology Building)
- **GitHub**: https://github.com/ExtensityAI/ontology-hydra
- **Stars**: 18
- **License**: BSD-3
- **Language**: Python

**Purpose**: Build and explore OWL 2 EL ontologies with AI agents. Each ontology is a single SQLite file.

**Tools:**
- `add_axioms` -- Add validated axioms (duplicates auto-skipped)
- `remove_axioms` -- Remove by hash or selection
- `annotate_axiom` -- Change annotations
- `replace_axiom` -- Atomic delete + add
- `rename_iri` -- Rewrite IRI across axioms
- `describe_ontology` -- Entity/axiom counts, prefix mappings
- `get_entity` -- Roles, annotations for one entity
- `find_entities` -- Text search by role/namespace
- `find_axioms` -- Search on annotations
- `match_axioms` -- Structural pattern matching
- `create_selection` / `read_selection` / `list_selections` -- Named axiom sets
- `export_ontology` -- Dump to JSONL

### Protégé MCP (Ontology Editor Integration)
- **GitHub**: https://github.com/CharlesBoydelaTour/protege-mcp
- **Transport**: stdio (attached to live Protégate Desktop)

**Tools (v1):**
- `server_info` -- Server version
- `ontology_list` -- Open ontologies
- `ontology_open` / `ontology_close` -- Load/close ontologies
- `ontology_capabilities` -- Write support, reasoner, export formats
- `entity_search` -- Search by fragment or label
- `entity_get` -- Entity details and annotations
- `dl_query` -- Manchester Syntax DL queries
- `ontology_save` / `ontology_export` -- Persist/export

---

## SDKs & Frameworks

### Python
| SDK | Database | Notes |
|---|---|---|
| `stardog-python` | Stardog | Official Python client |
| `rdflib` | Any RDF store | Universal RDF library |
| `pyonto` | Any OWL/OWL2 | Ontology manipulation |
| `neo4j-graphrag` | Neo4j | Knowledge graph construction |
| `langchain` | Neo4j + others | Document loaders + graph transformers |

### JavaScript/Node.js
| SDK | Database | Notes |
|---|---|---|
| `sparqljs` | Any SPARQL endpoint | SPARQL query builder |
| `rdf-ext` | Any RDF store | RDF/JS compliant |

---

## AWS Agent Integration (Stardog + Neptune)

### Stardog + Amazon Bedrock AgentCore
- **Blog**: https://aws.amazon.com/blogs/machine-learning/build-a-semantic-layer-for-agentic-ai-on-aws-with-stardog-and-amazon-bedrock-agentcore/
- **Published**: July 2026

**Architecture:**
- Stardog as semantic layer federating Aurora + Redshift
- AgentCore Gateway with Stardog MCP server as target
- AgentCore Identity for credential brokering
- Two integration paths:
  - Path A (direct): Strands agent calls SPARQL tool directly to Stardog
  - Path B (MCP): AgentCore Gateway -> Stardog Cloud MCP server

### Neptune + AgentCore
- Neptune MCP behind AgentCore Gateway
- Custom ontology builder agent scrapes Glue Catalog -> Neptune
- Unified agent routes NLP queries to Athena, semantic queries to Neptune via MCP

---

## Comparison Matrix

| Feature | GraphDB | Stardog | Neptune | Jena Fuseki |
|---|---|---|---|---|
| **Built-in MCP** | Yes (v11.3+) | No (separate) | No (AWS Labs) | No (community) |
| **NLQ (Natural Language)** | Talk to Your Graph | Voicebox | No | No |
| **SPARQL** | Yes | Yes | No (Gremlin/openCypher) | Yes |
| **Similarity Search** | Yes (vector indexes) | Yes (embeddings) | No | No |
| **Full-Text Search** | Yes | Yes | No | No |
| **Reasoning** | RDFS/OWL | OWL + rules | No | Jena reasoning |
| **Federation** | Yes (virtual repos) | Yes (data source mapping) | No | Yes (SPARQL-fed) |
| **Cloud Managed** | GraphDB Cloud | Stardog Cloud | Amazon Aura | -- |
| **Free/Free Tier** | Free edition | Free (local) | -- | Open source |
