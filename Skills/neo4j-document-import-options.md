# Neo4j Document & Text Import Options

All available methods for importing documents or text into Neo4j, compiled from the neo4j-skills repository.

---

## Quick Decision Guide

| Situation | Best Approach |
|---|---|
| No code; drag-and-drop UX | **LLM Graph Builder** (web UI) |
| Programmatic pipeline with PDFs/text | **SimpleKGPipeline** (neo4j-graphrag) |
| JSON / REST API responses | **apoc.load.json** or Python + UNWIND |
| LangChain already in stack | **Neo4jGraph** + document loader |
| LlamaIndex already in stack | **Neo4jQueryEngine** / **Neo4jVectorStore** |
| Chunk-only (no entity extraction) | Manual chunking + MERGE pattern |
| Structured CSV/relational data | **LOAD CSV** or **neo4j-admin import** |
| Big data / Spark pipelines | **Spark Connector** |
| Real-time streaming | **Kafka Sink Connector** |

---

## 1. SimpleKGPipeline (Recommended for Most Cases)

End-to-end knowledge graph construction from unstructured documents. Chunks text, extracts entities/relationships with an LLM, creates embeddings, and writes the full lexical graph (`Document -> Chunk -> Entity`) plus entity-relationship edges into Neo4j.

### What it does
- Chunks text, extracts entities/relationships with an LLM
- Creates embeddings for semantic search
- Writes Document, Chunk, and Entity nodes with relationships
- Supports entity resolution (exact match, fuzzy match, SpaCy semantic)

### Resulting graph structure
```
(:Document {id, fileName, ...}) -[:HAS_CHUNK]-> (:Chunk {id, text, index, embedding})
(:Chunk) -[:NEXT_CHUNK]-> (:Chunk)
(:Chunk) -[:MENTIONS]-> (:Person/Organization/etc.)
(:Person) -[:WORKS_AT]-> (:Organization)
```

### Code example
```python
from neo4j import GraphDatabase
from neo4j_graphrag.experimental.pipeline.kg_builder import SimpleKGPipeline
from neo4j_graphrag.llm import OpenAILLM
from neo4j_graphrag.embeddings import OpenAIEmbeddings

driver = GraphDatabase.driver("neo4j+s://xxx.databases.neo4j.io", auth=("neo4j", "password"))
llm = OpenAILLM(model_name="gpt-4.1", model_params={"temperature": 0})
embedder = OpenAIEmbeddings()

pipeline = SimpleKGPipeline(
    llm=llm, driver=driver, embedder=embedder, schema=schema,
    from_file=True, on_error="IGNORE", perform_entity_resolution=True,
)
result = asyncio.run(pipeline.run_async(file_path="report.pdf"))
```

### Chunking strategies

| Strategy | Best for | Class |
|---|---|---|
| Fixed-size | Dense technical docs; default | `FixedSizeSplitter` |
| Sentence/paragraph | Narrative, news, courses | LangChain `CharacterTextSplitter` |
| Semantic | Topic-shift-heavy docs | LangChain `SemanticChunker` |
| Structural | API docs, legal contracts | Custom parser |

### Install
```bash
pip install neo4j-graphrag[openai]  # or [anthropic], [google], [ollama], [bedrock], [mistralai], [fuzzy-matching], [nlp]
```

### References
- [neo4j-graphrag KG Builder guide](https://neo4j.com/docs/neo4j-graphrag-python/current/user_guide_kg_builder.html)
- [LLM Graph Builder GitHub](https://github.com/neo4j-labs/llm-graph-builder)

---

## 2. LLM Graph Builder (No-Code Web UI)

Drag-and-drop web interface for ingesting documents into a knowledge graph without writing code.

### Supported sources
PDF, plain text, Markdown, images, web pages, YouTube transcripts, S3/GCS bucket uploads.

### LLM providers
OpenAI, Gemini, Claude, Llama3, Diffbot, Qwen.

### Chunking options in UI
Token-based, Page-based, Semantic, Paragraph.

### Usage
- **Hosted**: https://llm-graph-builder.neo4jlabs.com/
- **Local (Docker)**:
```bash
git clone https://github.com/neo4j-labs/llm-graph-builder
cd llm-graph-builder
docker-compose up
# Opens at http://localhost:8080
```

### Limitations
- Best with long-form English text
- Poor on tabular data
- Visual diagrams not extracted

---

## 3. APOC JSON Ingestion (Semi-Structured Data)

Load JSON from URLs or local files using `apoc.load.json`, then create nodes/relationships with Cypher.

### Key Cypher pattern
```cypher
CYPHER 25
CALL apoc.load.json("https://example.com/articles.json") YIELD value
UNWIND value.articles AS article
CALL (article) {
  MERGE (d:Document {id: article.id})
  SET d.title = article.title, d.url = article.url, d.publishedAt = article.publishedAt
  FOREACH (tag IN article.tags |
    MERGE (t:Tag {name: tag})
    MERGE (d)-[:HAS_TAG]->(t)
  )
} IN TRANSACTIONS OF 1000 ROWS
```

### Key details
- File must be in `$NEO4J_HOME/import/` or APOC `allowlist` configured
- Verify APOC with `RETURN apoc.version()`

### References
- [APOC load procedures](https://neo4j.com/docs/apoc/current/import/)

---

## 4. GenAI Plugin (Pure Cypher)

In-Cypher functions for embedding generation, text chunking, completions, and structured extraction. No external Python needed.

### Single Embed
```cypher
CYPHER 25
MATCH (c:Chunk) WHERE c.embedding IS NULL
SET c.embedding = ai.text.embed(c.text, 'openai', {
  token: $openaiKey, model: 'text-embedding-3-small'
})
```

### Batch Embed
```cypher
CYPHER 25
MATCH (c:Chunk) WHERE c.embedding IS NULL
WITH collect(c) AS chunks
UNWIND chunks AS c
CALL ai.text.embedBatch(c.text, 'openai', { token: $openaiKey, model: 'text-embedding-3-small' })
YIELD index, resource, vector
MATCH (c:Chunk {text: resource})
SET c.embedding = vector
```

### In-Cypher Chunking
```cypher
CYPHER 25
UNWIND ai.text.chunkByTokenLimit($longText, 512, 'gpt-4', 50) AS chunk
MERGE (c:Chunk { text: chunk })
```

### Structured Extraction
```cypher
CYPHER 25
MATCH (p:Product {id: $productId})
WITH p,
  ai.text.structuredCompletion(
    'Extract key attributes from: ' + p.description,
    { type: 'object', properties: { category: {type:'string'}, tags: {type:'array',items:{type:'string'}} } },
    'openai', { token: $openaiKey, model: 'gpt-4o-mini' }
  ) AS extracted
SET p.category = extracted.category
```

### Providers
openai, azure-openai, vertexai, bedrock-titan, bedrock-nova. Requires CYPHER 25. Enabled by default on Aura.

### References
- [Official docs](https://neo4j.com/docs/genai/plugin/current/)

---

## 5. LangChain Integration

Use LangChain document loaders + text splitters + Neo4jGraph to chunk, embed, and store documents.

### Code example
```python
from langchain_community.graphs import Neo4jGraph
from langchain_community.document_loaders import PyPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings

loader = PyPDFLoader("report.pdf")
docs = loader.load()
splitter = RecursiveCharacterTextSplitter(chunk_size=512, chunk_overlap=64)
chunks = splitter.split_documents(docs)

embedder = OpenAIEmbeddings()
driver = GraphDatabase.driver(url, auth=("neo4j", "password"))

for i, chunk in enumerate(chunks):
    emb = embedder.embed_query(chunk.page_content)
    driver.execute_query(
        """
        MERGE (doc:Document {id: $doc_id})
        SET doc.source = $source
        CREATE (c:Chunk {id: $chunk_id, text: $text, embedding: $emb, index: $idx})
        CREATE (doc)-[:HAS_CHUNK]->(c)
        """,
        doc_id=chunk.metadata.get("source", "unknown"), ...
    )
```

### Entity extraction with LangChain
Use `LLMGraphTransformer` from `langchain_experimental.graph_transformers`.

### References
- [LangChain Neo4j Integration](https://python.langchain.com/docs/integrations/graphs/neo4j_cypher/)

---

## 6. LlamaIndex Integration

Use LlamaIndex `Neo4jQueryEngine` or `Neo4jVectorStore` for document ingestion and retrieval.

### References
- [LlamaIndex Neo4jQueryEngine](https://docs.llamaindex.ai/en/stable/examples/index_structs/knowledge_graph/Neo4jKGIndexDemo/)

---

## 7. Custom DataLoader

Subclass `DataLoader` to handle any document format (HTML, web pages, JSON fields, custom).

### Code examples
```python
from neo4j_graphrag.experimental.components.data_loader import DataLoader
from neo4j_graphrag.experimental.components.types import DocumentInfo, LoadedDocument

class WebPageLoader(DataLoader):
    async def run(self, filepath, metadata=None):
        import httpx
        text = httpx.get(filepath).text
        return LoadedDocument(text=text,
            document_info=DocumentInfo(path=filepath, metadata=metadata))

class JsonFieldLoader(DataLoader):
    def __init__(self, text_field):
        self.text_field = text_field
    async def run(self, filepath, metadata=None):
        import json, pathlib
        data = json.loads(pathlib.Path(filepath).read_text())
        return LoadedDocument(text=data[self.text_field],
            document_info=DocumentInfo(path=filepath, metadata=metadata))

pipeline = SimpleKGPipeline(..., file_loader=WebPageLoader(), from_file=True)
```

Supports fsspec URIs (`s3://`, `gcs://`).

---

## 8. LOAD CSV + CALL IN TRANSACTIONS

Standard online import for structured CSV data with Cypher.

### Key pattern
```cypher
CYPHER 25
LOAD CSV WITH HEADERS FROM 'file:///persons.csv' AS row
CALL (row) {
  MERGE (p:Person {id: row.id})
  ON CREATE SET
    p.name = row.name,
    p.age = toIntegerOrNull(row.age),
    p.score = toFloatOrNull(row.score)
} IN TRANSACTIONS OF 10000 ROWS
  ON ERROR CONTINUE
  REPORT STATUS AS s
```

### Aura limitation
Only `https://` URLs -- no `file:///`.

---

## 9. neo4j-admin database import (Offline Bulk Load)

Fastest method (~3 min for 31M nodes / 78M rels). Requires DB stopped or non-existent. Self-managed only.

### Command
```bash
neo4j-admin database import full \
  --nodes=Person="persons_header.csv,persons.csv" \
  --nodes=Movie="movies_header.csv,movies.csv" \
  --relationships=ACTED_IN="acted_in_header.csv,acted_in.csv" \
  --id-type=STRING --threads=$(nproc) --high-parallel-io=on neo4j
```

### Incremental import (Enterprise)
`neo4j-admin database import incremental` -- three-phase process (prepare/build/merge).

---

## 10. APOC periodic.iterate + apoc.load.csv

Batch-process data using APOC procedures. Legacy approach; `CALL IN TRANSACTIONS` preferred for new code.

### Example
```cypher
CALL apoc.periodic.iterate(
  "LOAD CSV WITH HEADERS FROM 'file:///data.csv' AS row RETURN row",
  "MERGE (p:Person {id: row.id}) SET p.name = row.name",
  {batchSize: 10000, parallel: false, retries: 2}
) YIELD batches, total
```

---

## 11. Driver Batch Write Pattern (Python/JS)

Programmatic import from API responses, database migrations, or generated data using UNWIND batching.

### Python
```python
BATCH_SIZE = 10_000
def import_batch(tx, rows):
    tx.run("UNWIND $rows AS row MERGE (p:Person {id: row.id}) SET p.name = row.name", rows=rows)

with driver.session(database="neo4j") as session:
    batch = []
    for row in all_rows:
        batch.append(row)
        if len(batch) == BATCH_SIZE:
            session.execute_write(import_batch, batch)
            batch.clear()
    if batch:
        session.execute_write(import_batch, batch)
```

~10x faster than row-at-a-time -- network round-trips are the bottleneck.

---

## 12. Data Importer GUI

Visual drag-and-drop CSV import tool built into Neo4j Browser and Aura Console.

- **Best for**: <1M rows, no Cypher knowledge
- **Access in Aura**: console.neo4j.io -> Open instance -> click Import
- **Limitations**: Strings only (no lists/arrays on import); <1M rows recommended

---

## 13. Chunk-Only Manual Pattern (No Entity Extraction)

Chunk documents and store `:Chunk` nodes with embeddings, without LLM entity extraction. Best when you only need semantic search, not knowledge graph structure.

Uses the `Document -> HAS_CHUNK -> Chunk` pattern with manual MERGE/CREATE.

---

## 14. Vector Index Embedding Ingestion

Batch-update embeddings on existing nodes via Python loop + UNWIND, or in-Cypher with `ai.text.embed()`.

### Python pattern
```python
def store_embeddings(records, batch_size=500):
    for i in range(0, len(records), batch_size):
        batch = records[i:i+batch_size]
        texts = [r["text"] for r in batch]
        embeddings = embed_batch(texts)
        rows = [{"id": r["id"], "embedding": emb} for r, emb in zip(batch, embeddings)]
        driver.execute_query(
            "UNWIND $rows AS row MATCH (c:Chunk {id: row.id}) SET c.embedding = row.embedding",
            rows=rows, database_="neo4j"
        )
```

**Key rule**: Create vector index BEFORE ingesting embeddings.

---

## 15. Spark/Delta Lake -> Neo4j Ingestion

Big data pipeline from Spark/Delta Lake into Neo4j using `neo4j-connector-apache-spark`. Best for large-scale batch ingestion from data lakes, ETL pipelines, existing Spark infrastructure.

---

## 16. Kafka Sink Connector (Streaming)

Real-time streaming ingestion from Kafka topics into Neo4j using Neo4j Kafka Sink Connector. Best for event-driven architectures, real-time data pipelines, CDC patterns.

---

## 17. Aura Agents (Post-Ingestion Query Layer)

Not an import method, but a way to expose an already-ingested knowledge graph via natural language (REST/MCP endpoints). Uses CypherTemplate, SimilaritySearch, and Text2Cypher tools.

---

## Pre-Import Checklist

1. Create uniqueness constraints BEFORE any MERGE-based import
2. Verify APOC availability if using `apoc.*` procedures
3. Confirm target is PRIMARY (not replica)
4. Verify UTF-8 encoding on source files
5. Create vector indexes before storing embeddings
6. Wait for all indexes to be ONLINE before ingestion
7. Run entity resolvers AFTER bulk ingestion (not inline)

---

## Verification Cypher (Post-Import)

```cypher
-- Document/chunk counts
MATCH (d:Document)-[:HAS_CHUNK]->(c:Chunk) RETURN d.fileName, count(c) AS chunks LIMIT 10;

-- Entity counts by type
MATCH (c:Chunk)-[:MENTIONS]->(e) RETURN labels(e)[0] AS type, count(*) AS cnt ORDER BY cnt DESC LIMIT 20;

-- Find duplicate entities (pre-resolution)
MATCH (e) WITH e.name AS name, labels(e) AS lbl, count(*) AS cnt WHERE cnt > 1
RETURN name, lbl, cnt ORDER BY cnt DESC;

-- Index status
SHOW INDEXES YIELD name, state WHERE state <> 'ONLINE';
```

---

## Cross-Skill References

| Topic | Skill |
|---|---|
| Vector index creation for embeddings | `neo4j-vector-index-skill` |
| Cypher query authoring | `neo4j-cypher-skill` |
| GraphRAG retrieval after ingestion | `neo4j-graphrag-skill` |
| GDS algorithms (FastRP, Node2Vec) | `neo4j-gds-skill` |
| Agent long-term memory | `neo4j-agent-memory-skill` |
| AuraDB provisioning | `neo4j-aura-provisioning-skill` |
| Streaming ingestion (Kafka) | `neo4j-kafka-skill` |
| Big data pipelines (Spark) | `neo4j-spark-skill` |
