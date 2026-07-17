# Neo4j Utilization Migration Plan

> **Problem:** Neo4j is used as a dumb key-value store — basic MERGE writes, 2 simple reads, and full-graph extraction into Python. The GDS library, APOC, vector indexes, constraints, and managed transactions are all unused. The Python `gnn-runtime/` reimplements Node2Vec, community detection, and centrality that GDS provides natively.

> **Goal:** Migrate to use Neo4j as a graph analytics engine — GDS for algorithms, APOC for batch ops, vector indexes for similarity, managed transactions for reliability, and proper constraints for performance.

---

## Blocker: Community vs Enterprise

**Current:** `neo4j:5.26-community`
**GDS Community Edition** includes ALL algorithms (PageRank, Louvain, Node2Vec, centrality, link prediction) — limited to 4 CPU cores and 3 models in catalog. **This is sufficient for Polanyi's scale.**

**Decision:** Stay on Community Edition. GDS Community has everything needed.

**Compatibility:** Neo4j 5.26 → GDS 2.13 (confirmed in compatibility matrix).

---

## Phase 1: Infrastructure (Day 1)

### 1.1 Add GDS + APOC to Docker

**File:** `infrastructure/docker/docker-compose.yml`

Change Neo4j service from:
```yaml
NEO4J_PLUGINS: '["n10s"]'
NEO4J_dbms_security_procedures_unrestricted: "n10s.*"
```

To:
```yaml
NEO4J_PLUGINS: '["n10s","graph-data-science","apoc"]'
NEO4J_dbms_security_procedures_unrestricted: "n10s.*,gds.*,apoc.*"
```

**No license file needed** — GDS Community is free.

### 1.2 Add Constraints and Indexes

**New file:** `packages/execution-runtime/execution/schema.py`

Create uniqueness constraints and indexes after first materialization:

```cypher
-- Uniqueness constraints (speeds up MERGE dramatically)
CREATE CONSTRAINT entity_name_unique IF NOT EXISTS
  FOR (e:Entity) REQUIRE e.name IS UNIQUE;
CREATE CONSTRAINT term_name_unique IF NOT EXISTS
  FOR (t:Term) REQUIRE t.term IS UNIQUE;
CREATE CONSTRAINT document_source_unique IF NOT EXISTS
  FOR (d:Document) REQUIRE d.source IS UNIQUE;
CREATE CONSTRAINT mention_id_unique IF NOT EXISTS
  FOR (m:Mention) REQUIRE m.id IS UNIQUE;

-- Full-text index for fuzzy search
CREATE FULLTEXT INDEX entity_term_search IF NOT EXISTS
  FOR (n:Entity|Term) ON EACH [n.name, n.definition];
```

### 1.3 Switch to Managed Transactions

**File:** `packages/execution-runtime/execution/knowledge_graph.py`

Replace all `session.run()` with `session.execute_read()` / `session.execute_write()`:

Before:
```python
with self._driver.session() as session:
    for statement, params in statements:
        session.run(statement, params)
```

After:
```python
with self._driver.session() as session:
    def write_tx(tx, stmt, params):
        return tx.run(stmt, params).data()
    for statement, params in statements:
        session.execute_write(write_tx, statement, params)
```

**Benefit:** Automatic retries on transient failures, proper connection pooling.

---

## Phase 2: GDS Algorithms (Day 2-3)

### 2.1 Replace Python Node2Vec with GDS Node2Vec

**File:** `packages/gnn-runtime/gnn/embeddings.py`

Replace the PyTorch Geometric Node2Vec with GDS-native:

```cypher
-- Step 1: Project graph for GDS
CALL gds.graph.project(
  'polanyi-embeddings',
  ['Entity', 'Term', 'Document', 'Mention'],
  {
    RELATES_TO: {orientation: 'UNDIRECTED'},
    DESCRIBES: {orientation: 'UNDIRECTED'},
    MENTIONS: {orientation: 'UNDIRECTED'},
    REFERS_TO: {orientation: 'UNDIRECTED'}
  }
);

-- Step 2: Run Node2Vec (writes embeddings back to Neo4j)
CALL gds.node2vec.stream('polanyi-embeddings', {
  embeddingDimension: 64,
  walkLength: 80,
  iterations: 10,
  inOutFactor: 1.0,
  returnFactor: 1.0
})
YIELD nodeId, embedding
WITH gds.util.asNode(nodeId) AS node, embedding
SET node.embedding = embedding;
```

**Benefit:** No graph extraction needed. Embeddings stored in Neo4j. 10-100x faster than Python extraction + PyG.

### 2.2 Replace Python KMeans with GDS Louvain

**File:** `packages/gnn-runtime/gnn/anomaly.py`

Replace `sklearn.cluster.KMeans` with GDS community detection:

```cypher
-- Louvain community detection (native, parallel, no data extraction)
CALL gds.louvain.stream('polanyi-embeddings')
YIELD nodeId, communityId
WITH gds.util.asNode(nodeId) AS node, communityId
SET node.community = communityId;
```

**Benefit:** Runs inside Neo4j, no data transfer, handles much larger graphs.

### 2.3 Add PageRank for Entity Importance

**New capability:** Entity importance scoring (currently not computed at all)

```cypher
CALL gds.pageRank.stream('polanyi-embeddings')
YIELD nodeId, score
WITH gds.util.asNode(nodeId) AS node, score
SET node.pagerank = score;
```

**Use:** Highlight important entities in the Knowledge Graph view, rank search results.

### 2.4 Add Betweenness Centrality for Bridge Detection

```cypher
CALL gds.betweenness.stream('polanyi-embeddings')
YIELD nodeId, score
WITH gds.util.asNode(nodeId) AS node, score
SET node.betweenness = score;
```

**Use:** Identify "bridge" entities that connect different parts of the graph — governance-critical nodes.

### 2.5 Replace Python Cosine Similarity with GDS Node Similarity

```cypher
CALL gds.nodeSimilarity.stream('polanyi-embeddings', {
  topK: 10,
  similarityCutoff: 0.5
})
YIELD node1, node2, similarity
RETURN gds.util.asNode(node1).name AS source,
       gds.util.asNode(node2).name AS target,
       similarity
ORDER BY similarity DESC;
```

**Use:** Link suggestions, entity deduplication, alignment quality scoring.

---

## Phase 3: Vector Index (Day 3-4)

### 3.1 Create Vector Index

```cypher
CREATE VECTOR INDEX entity_embeddings IF NOT EXISTS
  FOR (e:Entity)
  ON (e.embedding)
  OPTIONS {
    indexConfig: {
      `vector.dimensions`: 64,
      `vector.similarity_function`: 'cosine'
    }
  };
```

### 3.2 Vector Search for Similarity

```cypher
-- Find entities similar to a query entity
CALL db.index.vector.queryNodes(
  'entity_embeddings',
  10,
  $query_embedding
)
YIELD node, score
RETURN node.name, score;
```

**Benefit:** Sub-millisecond similarity search without pulling graph into Python.

### 3.3 Hybrid Search (Vector + Full-text)

```cypher
-- Combine vector similarity with full-text keyword match
CALL db.index.fulltext.queryNodes(
  'entity_term_search',
  $search_query,
  {limit: 10}
)
YIELD node, score AS text_score
WITH node, text_score
CALL db.index.vector.queryNodes(
  'entity_embeddings',
  10,
  $query_embedding
)
YIELD node AS vec_node, score AS vec_score
WHERE node = vec_node
RETURN node.name, text_score + vec_score AS combined_score
ORDER BY combined_score DESC;
```

---

## Phase 4: APOC Batch Operations (Day 4)

### 4.1 Batch Materialization

Replace single-statement materialization with batched:

```python
# Before: one statement at a time
for statement, params in statements:
    session.run(statement, params)

# After: batch via CALL IN TRANSACTIONS
def materialize_batch(self, context):
    statements = materialization_statements(context)
    with self._driver.session() as session:
        for statement, params in statements:
            session.run(
                f"{statement} IN TRANSACTIONS OF 1000 ROWS",
                params
            )
```

### 4.2 Schema Introspection via APOC

```cypher
-- Get full schema (nodes, relationships, properties)
CALL apoc.meta.schema()
YIELD value
RETURN value;
```

### 4.3 Graph Refresh Procedure

```cypher
-- Refresh GDS graph projection after writes
CALL gds.graph.drop('polanyi-embeddings', false);
CALL gds.graph.project(
  'polanyi-embeddings',
  ['Entity', 'Term', 'Document', 'Mention'],
  { ... }
);
```

---

## Phase 5: New Cypher Queries (Day 5)

### 5.1 Shortest Path Between Entities

```cypher
-- Find shortest path between two entities
MATCH path = shortestPath(
  (a:Entity {name: $from})-[*]-(b:Entity {name: $to})
)
RETURN [n IN nodes(path) | n.name] AS path_names,
       length(path) AS hops;
```

### 5.2 Neighborhood Search with Depth

```cypher
-- Get all nodes within 2 hops of an entity
MATCH (e:Entity {name: $name})-[*1..2]-(neighbor)
RETURN DISTINCT neighbor, labels(neighbor) AS types;
```

### 5.3 Graph Statistics Dashboard

```cypher
-- Rich statistics for the Intelligence page
MATCH (n)
WITH labels(n)[0] AS label, count(n) AS cnt
RETURN label, cnt ORDER BY cnt DESC;

MATCH ()-[r]->()
WITH type(r) AS rel, count(r) AS cnt
RETURN rel, cnt ORDER BY cnt DESC;

-- Degree distribution
MATCH (n)
WITH n, size([(n)-[]-() | 1]) AS degree
RETURN
  avg(degree) AS avg_degree,
  max(degree) AS max_degree,
  count(CASE WHEN degree = 0 THEN 1 END) AS isolated;
```

---

## Phase 6: HTML Prototype Additions (Day 5-6)

### 6.1 New "Neo4j Analytics" Section in Intelligence Group

Add to sidebar under Intelligence:
```
Intelligence/
  ├── Graph Insights          (existing)
  ├── Anomaly Scores          (existing)
  ├── Alignment Quality       (existing)
  ├── Graph Analytics         ← NEW (GDS algorithms dashboard)
  └── Vector Search           ← NEW (similarity search UI)
```

### 6.2 Graph Analytics Page (HTML)

New view `#view-analytics` with:

**KPI Cards (4 across):**
- PageRank Score (top entity + distribution)
- Community Count (Louvain clusters)
- Centrality Score (highest betweenness entity)
- Graph Density (actual vs possible edges)

**Algorithm Runner Panel:**
- Dropdown: PageRank / Louvain / Betweenness / Node2Vec / Node Similarity
- "Run Algorithm" button
- Results table with scores
- Export to JSON button

**Centrality Heatmap:**
- Visual grid showing node betweenness scores
- Red = high centrality (bridge nodes), green = low

**Community Map:**
- Color-coded node list grouped by Louvain community
- Coherence score per community

### 6.3 Vector Search Page (HTML)

New view `#view-vector-search` with:

**Search Panel:**
- Text input: "Search entities by meaning..."
- Dropdown: "Similarity type: cosine / euclidean"
- Slider: "Top K: 1-50"
- "Search" button

**Results Panel:**
- Table: Entity name, similarity score, community, PageRank
- Click entity → navigate to KG view with that entity selected

**Embedding Visualization:**
- 2D scatter plot (t-SNE/PCA projection of embeddings)
- Color by community
- Size by PageRank score

### 6.4 Updated Insights Page

Add GDS-computed metrics to existing Insights page:
- Replace Python-computed grounding score with GDS-native metrics
- Add PageRank-based entity importance to link suggestions
- Add Louvain community labels to community cards
- Add betweenness centrality to anomaly detection

---

## File Changes Summary

| File | Change |
|------|--------|
| `infrastructure/docker/docker-compose.yml` | Add GDS + APOC plugins |
| `packages/execution-runtime/execution/schema.py` | **NEW** — constraints, indexes, vector index |
| `packages/execution-runtime/execution/knowledge_graph.py` | Managed transactions, batch materialization |
| `packages/gnn-runtime/gnn/embeddings.py` | Replace PyG Node2Vec with GDS Node2Vec |
| `packages/gnn-runtime/gnn/anomaly.py` | Replace KMeans with GDS Louvain, add PageRank/centrality |
| `packages/gnn-runtime/gnn/export.py` | Simplify with GDS graph projection |
| `packages/gnn-runtime/gnn/insights.py` | Use GDS-native metrics |
| `packages/gnn-runtime/gnn/router.py` | Add analytics + vector search endpoints |
| `docs/design/polanyi-studio-prototype.html` | Add Analytics + Vector Search pages |

---

## Migration Risk Assessment

| Risk | Mitigation |
|------|-----------|
| GDS Community limits (4 cores, 3 models) | Polanyi graph is ~50 nodes — well within limits |
| Docker image size increase (~500MB for GDS) | Acceptable for dev; production can use Aura |
| Breaking changes to existing `session.run()` calls | Managed transactions are backward-compatible |
| n10s + GDS + APOC plugin conflict | All three are officially supported together |
| Python GNN code becomes partially redundant | Keep PyG for advanced ML (GCN link prediction); GDS handles the rest |

---

## Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| Graph extraction queries | 145 | 1 (GDS projection) |
| Node2Vec training | Python-side (slow) | GDS-native (10-100x faster) |
| Community detection | sklearn KMeans on extracted data | GDS Louvain in-database |
| Entity importance | Not computed | PageRank (native) |
| Bridge detection | Not computed | Betweenness centrality (native) |
| Similarity search | Python cosine matrix | Neo4j vector index (sub-ms) |
| Fuzzy search | Not available | Full-text index |
| MERGE performance | No constraints | Unique constraints (10x faster) |
| Transaction reliability | No retries | Managed transactions with auto-retry |
