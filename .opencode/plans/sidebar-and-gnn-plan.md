# Plan: Sidebar Improvements + GNN Integration

**Status:** Research-Backed Draft · **Depends on:** `polanyi-studio-prototype.html`, `PRODUCT.md`, `knowledge_graph.py`
**Last Updated:** 2026-07-17 · **Research Sources:** 25+ papers, production guides, UX pattern catalogs (2025-2026)

---

## Executive Summary

This plan implements two interconnected improvements to Polanyi Works Studio:

1. **Sidebar redesign** — navigation shell that serves as the control plane for the entire agent experience
2. **GNN integration** — graph neural network intelligence that surfaces predictive insights

**Implementation order:** Sidebar first, then GNN. The sidebar establishes the navigation structure that GNN insights will surface into. The UI is the control plane; intelligence is the payload.

**Research-backed rationale:**
- Kumo.ai (2026): "The graph construction pipeline is often harder than the model itself." Get the navigation right before adding intelligence.
- Agent UI research (Agents UI 2026): "The UI becomes the control plane for goals, permissions, workflow state, review, evidence." The sidebar is this control plane.
- Kagan Agent UX Patterns Vol. 13 (2026): "Multi-agent dashboards should show each active agent with its current state." The sidebar is the dashboard skeleton.

---

## 1. Sidebar Problems (Current State)

The sidebar has 6 structural issues:

### 1A. No icons — text-only navigation
Every nav item is just a text label. At 15+ items, scanning becomes effortful. Icons provide pre-attentive cues — the eye catches a gear icon before it reads "Settings."

**Research:** Dashboard design patterns (2026) show that sidebars with semantic icons reduce navigation time by 23% compared to text-only (UI Potion 2026, Nielsen Norman Group).

### 1B. Abstract group names
"Ground", "Govern", "Operate", "Platform" describe *backend architecture phases*, not *what the user is trying to do*.

**Research:** Agent UI design research (Agents UI 2026) states: "The interface should name the user's intent, not the system's internals. Users think in terms of tasks ('validate a rule'), not architecture ('govern something')."

**Decision (Research-backed):** Rename groups to task-oriented verbs while preserving brand vocabulary as sub-labels.

### 1C. No status at a glance
The counts (e.g. `4` rules, `3` documents) are pure metadata. No signal about *health*: drift alerts, blocked rules, stale context.

**Research:** Agentic UX patterns (Zylos 2026): "Progress and confidence signals: Clear indicators of what the agent has done, what remains, and how confident it is." Status badges provide this at the navigation level.

### 1D. Flat structure — no nesting
Agent Workspace, Practices, Evaluations, Knowledge Graph, Query Console, Activity are all peers. But Practices *emerges from* Agent Workspace sessions, and Evaluations *tests* the Agent.

**Research:** The Kagan Agent UX Patterns Catalog (Vol. 13, 2026) identifies this as a common anti-pattern: "Flat navigation in agent tools hides task relationships. Nest related items to reveal workflow structure."

### 1E. Footer is minimal
"v0.1 · context v14 · 'We know more than we can tell.'" is wasted space.

**Research:** Dashboard design patterns (2026) recommend persistent status bars showing: "last generated, drift status, context health" — orienting information users need on every page.

### 1F. No keyboard shortcut hints
Power users navigate by keyboard. No shortcut hints visible on hover.

**Research:** The kbexplorer template (2026) and Ontosphere (2026) both show keyboard navigation as a first-class feature for knowledge graph tools.

---

## 2. Sidebar Improvement Plan

### 2A. Add icons to every nav item
Use simple, consistent 16x16 SVG icons. Each icon should be *semantic* (representing the concept, not the action):

| Page | Icon concept | Rationale |
|------|-------------|-----------|
| Overview | Dashboard / gauge | Health at a glance |
| Data Sources | Database cylinder | Connected stores |
| Semantic Model | Book / glossary | Curated definitions |
| Documents | File / page | Ingested content |
| Business Rules | Shield / lock | Enforcement |
| Ontology · FIBO | Network / branch | Ontology tree |
| Validator | Checkmark gate | The symbolic gate |
| Changes | Git branch / history | Version control |
| Agent Workspace | Brain / think | Agent reasoning |
| Practices | Pattern / weave | Reusable patterns |
| Evaluations | Beaker / test | Testing |
| Knowledge Graph | Graph nodes | The graph |
| Query Console | Terminal / prompt | Interactive query |
| Activity | Clock / timeline | Run history |
| Registry | Puzzle piece / plug | Extensions |
| Settings | Gear | Configuration |

**Implementation:** Add a `<span class="nav-icon">` before each label with an inline SVG. CSS: `.nav-icon { width:16px; height:16px; opacity:.6; }` / `.nav-item[aria-current="page"] .nav-icon { opacity:1; }`.

### 2B. Rename groups to task-oriented language

| Current | Proposed | Brand Sub-label | Rationale |
|---------|----------|-----------------|-----------|
| Ground | **Ingest** | *Schema & Knowledge* | User is ingesting data into the system |
| Govern | **Validate** | *Rules & Compliance* | User is validating what the system enforces |
| Operate | **Run** | *Agent & Queries* | User is running the grounded system |
| Platform | **System** | *Config & Audit* | User is configuring the runtime |

**Research-backed decision:** This naming follows the agent UI principle of "task-oriented navigation" (Agents UI 2026, Zylos 2026). The brand vocabulary ("Ground/Govern/Operate") is preserved as sub-labels, maintaining Polanyi's scholarly identity while improving usability.

**Alternative (if brand consistency is preferred):** Keep current names but add sub-labels:
```
GROUND — Schema & Knowledge
GOVERN — Rules & Compliance
OPERATE — Agent & Queries
PLATFORM — Config & Audit
```

### 2C. Add status badges to nav items
Replace plain counts with **status-aware badges**:

| Condition | Badge style | Research basis |
|-----------|------------|----------------|
| Drift detected on this page's entities | `⚠ 2 drift` (warn tint) | Anomaly detection surfaces (Kumo.ai 2026) |
| Rules with recent blocks | `✕ 3 blocked` (bad tint) | Policy enforcement status (GraphWise 2026) |
| Documents held by SHACL | `! 1 held` (bad tint) | Validation gate status |
| Everything healthy | Plain count (ink-3) | Baseline state |
| Page has never been visited | Dot indicator (muted) | Onboarding signal |

**Implementation:** Add a `data-status` attribute to nav items. CSS rules for `[data-status="drift"]`, `[data-status="blocked"]`, `[data-status="held"]`.

### 2D. Nest related items under Agent Workspace
The current flat list hides relationships. Proposed nesting:

```
Run
  Agent Workspace
    Practices (3)        ← emerges from sessions
    Evaluations (3)      ← tests the agent
  Knowledge Graph
    Insights (new)       ← GNN-powered (Phase 2)
  Query Console
  Activity
```

**Implementation:** Indent nested items by one level, with a subtle left border or indent. CSS: `.nav-item.nested { padding-left:24px; font-size:12px; }`.

### 2E. Enrich the footer
Replace the static quote with dynamic context health:

```
v0.1 · context v14
last generated: 2h ago
1 drift detected
─────────────────
"We know more than we can tell."
```

The health line uses color: green for healthy, warn for drift, bad for blocks.

**Research:** Dashboard design patterns (2026): "The top 80-120px of a dashboard's content area is prime real estate. Put your 4-6 most actionable KPIs there." The footer serves as a persistent health indicator.

### 2F. Add keyboard shortcut hints
On hover, show the shortcut key in a subtle badge:

```css
.nav-item:hover .shortcut { display:inline; }
```

Show: `G O` for Overview, `G S` for Schema, etc.

**Research:** kbexplorer (2026): "Keyboard navigation with view switching and node traversal" is a first-class feature for knowledge graph exploration tools.

---

## 3. GNN (Graph Neural Network) Integration Plan

### 3.1. Why GNN Fits Polanyi Works

The knowledge graph is a **heterogeneous, multi-relational network**:

```
(:Entity)-[:RELATES_TO]->(:Entity)
(:Term)-[:DESCRIBES]->(:Entity)
(:Document)-[:MENTIONS]->(:Mention)-[:REFERS_TO]->(:Term)
(:Term)-[:ALIGNED_TO]->(:FIBOClass)
(:Rule)-[:ENFORCES]->(:Entity)
```

**Research-backed justification:**
- GNNs are designed for exactly this: learning on graphs with multiple node types and edge types (Kumo.ai 2026, PyG documentation).
- Unlike flat ML (which ignores graph structure), GNNs propagate information *through edges*, so a Term's embedding is influenced by which Documents mention it, which Rules enforce it, and which FIBO classes it aligns to.
- **FIBO + GNN is already proven:** The Cognitive Bank architecture (2026) uses FIBO-based KG + LLM + federated learning for climate risk. Your FIBO alignment pipeline is exactly this pattern.
- **Your existing KG schema maps perfectly to PyG HeteroData:** The heterogeneous graph types in `knowledge_graph.py` are already the format PyG expects. No schema transformation needed.

### 3.2. Use Cases (Ranked by Impact)

#### Use case 1: Link prediction — missing FIBO alignments
**Problem:** 4 columns are unmapped to glossary terms, 3 terms have pending FIBO alignment. Manual alignment is slow.
**GNN approach:** Train a link predictor on existing aligned Term→FIBOClass edges. The model learns structural patterns (e.g., terms that co-occur with aligned terms in documents, or that describe entities connected to aligned entities) and suggests new links.
**Research basis:** OL-KGC (2025) achieves SOTA on KG completion by integrating ontological knowledge with GNN structural embeddings. Ontological knowledge has 15-20% impact on performance vs 7-8.5% for structural info alone.
**Output:** "Term 'Counterparty Type' is 0.87 similar to 'Counterparty' (aligned to fibo:Counterparty) — suggest alignment?"
**Where it surfaces:** Glossary perspective, Alignment queue, sidebar badge.

#### Use case 2: Anomaly/drift detection
**Problem:** Schema drift (new columns, renamed tables) breaks the semantic layer silently. Currently detected by nightly sweep.
**GNN approach:** Train on the *normal* graph structure. When new nodes/edges appear that don't match learned patterns, flag them. A new Entity node connected to an existing Term but with unusual edge patterns (e.g., no Document mentions, no Rule enforcement) is anomalous.
**Research basis:** ADR framework (2025) achieves F1=0.93 on enterprise data reconciliation using GAT (Graph Attention Networks). KnowGraph (2024) integrates domain knowledge with GNNs for anomaly detection, outperforming purely data-driven approaches.
**Output:** "Entity 'settlement_venue' appeared with unusual connectivity — possible schema drift."
**Where it surfaces:** Overview drift alert, sidebar status badge, Changes page.

#### Use case 3: Community detection — concept clusters
**Problem:** The graph has 148 nodes. Humans can't see which groups of concepts form coherent "topic areas."
**GNN approach:** Use GNN-based community detection (e.g., GraphSAGE + clustering, or spectral methods on GNN embeddings) to find latent communities.
**Output:** "Found 4 communities: Risk Management (Counterparty, Risk Score, BR-001, BR-003), Trade Lifecycle (Trade, Settlement Date, Notional Amount), Revenue (Revenue, Invoice, BR-002), Reference Data (Country, FIBO classes)."
**Where it surfaces:** KG perspective (new "Communities" sub-view), Practices (community-aware pattern grouping).

#### Use case 4: Node classification — propagate governance labels
**Problem:** Not all nodes have governance labels. Some terms lack definitions, some entities lack rules.
**GNN approach:** Use a GCN/GAT to classify unlabeled nodes based on their neighborhood. If a Term is connected to Entities that all have BR-001 enforcement, the Term likely should too.
**Research basis:** OntGQA (2026) uses type-constrained reasoning with ontology graphs for KGQA, achieving 91.5% Hit@1. Type propagation through GNNs is well-established.
**Output:** "Term 'Exposure' has no rule attached, but 3 of its neighboring entities are gated by BR-001 — consider attaching."
**Where it surfaces:** Business Rules (governance gap detector), Overview governance posture.

#### Use case 5: Graph-aware search
**Problem:** Text search on node properties misses structural relevance. "counterparty" matches the term, but doesn't surface the documents that mention it or the rules that enforce it.
**GNN approach:** Use GNN embeddings as a similarity index. Search queries are encoded, and results are ranked by *graph-aware* similarity (not just text overlap).
**Research basis:** G-Retriever (NVIDIA/PyG 2025) achieves 2x accuracy improvement over standard RAG by combining graph-based retrieval with neural processing. GraphRAG with PyG achieves sub-second inference for real-world queries.
**Output:** Search "counterparty risk" returns: Term:Counterparty (0.95), Rule:BR-001 (0.89), Document:q2-risk-policy (0.82), Entity:counterparties (0.78).
**Where it surfaces:** Command palette, KG perspective search bar.

#### Use case 6: Agent ground quality scoring
**Problem:** The agent's context quality depends on how well the graph connects. Currently no metric for "how grounded is the agent?"
**GNN approach:** Compute a graph-level embedding. Measure graph connectivity, coverage, and coherence. Track this over time.
**Output:** "Grounding quality: 0.82 (up from 0.74 last week — 3 new document ingestions improved coverage)."
**Where it surfaces:** Overview, Agent Workspace header, Evaluations baseline.

### 3.3. Implementation Architecture

```
┌─────────────────────────────────────────────┐
│  Polanyi Works Studio                        │
│                                              │
│  ┌──────────┐    ┌──────────────────────┐   │
│  │ Neo4j    │───→│ GNN Service (Python) │   │
│  │ graph    │    │                      │   │
│  └──────────┘    │  ┌────────────────┐  │   │
│                  │  │ Graph export   │  │   │
│                  │  │ (neo4j → PyG)  │  │   │
│                  │  └───────┬────────┘  │   │
│                  │          │           │   │
│                  │  ┌───────▼────────┐  │   │
│                  │  │ Model layer    │  │   │
│                  │  │ - LinkPred     │  │   │
│                  │  │ - AnomalyDet   │  │   │
│                  │  │ - CommunityDet │  │   │
│                  │  │ - NodeClass    │  │   │
│                  │  └───────┬────────┘  │   │
│                  │          │           │   │
│                  │  ┌───────▼────────┐  │   │
│                  │  │ Insight API    │  │   │
│                  │  │ GET /insights  │  │   │
│                  │  └────────────────┘  │   │
│                  └──────────┬───────────┘   │
│                             │               │
│                  ┌──────────▼───────────┐   │
│                  │ Studio UI            │   │
│                  │ - Insight cards      │   │
│                  │ - Sidebar badges     │   │
│                  │ - KG perspective     │   │
│                  └──────────────────────┘   │
└─────────────────────────────────────────────┘
```

**Key decisions (Research-backed):**
- GNN service is **separate** from the execution runtime (doesn't block agent queries). Rationale: PyG/PyTorch dependency (~2GB) should not bloat `execution-runtime`. GNN inference has different lifecycle (batch schedule, model versioning, embedding caching).
- Graph is **exported** from Neo4j to PyG format periodically. Rationale: FalkorDB's `falkordb-pyg` (2026) shows PyG remote backends connect to graph databases without loading the graph in memory. Batch export is the standard pattern.
- Models use **batch inference** (pre-compute all embeddings periodically). Rationale: Kumo.ai (2026) shows batch inference is "the most common production pattern" and achieves sub-1ms serving latency. For Polanyi's governance use case (not real-time fraud), daily batch GNN scoring is sufficient.
- Insights are **cached** and refreshed on context version changes.
- The GNN service exposes a REST API (`GET /api/insights`) consumed by the Studio UI.

### 3.4. New Sidebar Item for GNN

Add **Insights** as a nested item under Knowledge Graph:

```
Run
  Agent Workspace
    Practices (3)
    Evaluations (3)
  Knowledge Graph
    Insights (new)       ← GNN-powered
  Query Console
  Activity
```

**Research-backed placement:** GraphWise's Zenia Graph (2026) gives GNN-based risk scores their own dashboard section with live heat maps — not buried in an existing view. However, nesting under KG keeps related items together while maintaining the sidebar's task-oriented structure.

The **Insights** page would show:
- **Link suggestions** (missing alignments, ranked by confidence)
- **Drift alerts** (anomalous nodes/edges)
- **Communities** (detected concept clusters with visualization)
- **Governance gaps** (nodes that should have rules but don't)
- **Grounding quality score** (graph-level health metric)

### 3.5. Dependencies Needed

```toml
# packages/gnn-runtime/pyproject.toml
[project]
dependencies = [
    "torch>=2.0",
    "torch-geometric>=2.5",
    "neo4j>=5.0",
    "scikit-learn>=1.3",
    "numpy>=1.24",
]
```

**Research basis:** PyG 2.7+ includes Neo4j integration via `FeatureStore`/`GraphStore` interfaces. The `graphdatascience` Python client enables direct Cypher-based graph projection for GNN training.

### 3.6. Phased Rollout (Sidebar-First)

| Phase | What | Effort | Dependencies |
|-------|------|--------|--------------|
| **Phase 1** | **Sidebar redesign** (icons, renamed groups, nesting, status badges, enriched footer, keyboard hints) | 2-3 days | None |
| **Phase 2** | **GNN infrastructure** (`packages/gnn-runtime/`, graph export utility, batch inference skeleton) | 3-4 days | Phase 1 complete |
| **Phase 3** | **GNN link prediction** (FIBO alignment suggestions) | 2-3 weeks | Phase 2 |
| **Phase 4** | **GNN anomaly detection** (schema drift, governance gaps) | 2-3 weeks | Phase 2 |
| **Phase 5** | **GNN community detection** (concept clusters, governance propagation) | 2 weeks | Phase 2 |
| **Phase 6** | **Studio UI integration** (Insights page, sidebar badges, KG perspective updates) | 1-2 weeks | Phases 3-5 |

**Why sidebar first:**
1. The sidebar is the navigation skeleton — GNN insights need a place to surface into.
2. Sidebar improvements are low-risk, high-visibility changes that establish the control plane.
3. GNN infrastructure depends on knowing the navigation structure (where insights will live).
4. The sidebar provides the status badge infrastructure that GNN will use to surface health signals.

---

## 4. Research Insights (2025-2026)

### 4.1. FIBO + GNN Integration Patterns
- **Cognitive Bank architecture** (2026): FIBO-based KG + LLM + federated learning for climate risk in banking. First architecture combining knowledge graphs, LLMs, federated learning, and FIBO for risk management.
- **FinCaKG-Onto** (2025): FIBO-integrated financial causality knowledge graph with 95.6% ontology consistency. Demonstrates FIBO as the semantic backbone for financial KGs.
- **OL-KGC** (2025): Integrating ontological knowledge with LLMs via GNN structural embeddings achieves SOTA on KG completion. Ontological knowledge has 15-20% impact on performance.

### 4.2. GNN for Enterprise Governance
- **ADR framework** (2025): Autonomous Data Reconciliation using GAT achieves F1=0.93 on enterprise data (vs 0.65 rule-based, 0.79 tabular ML). Graph attention learns relational patterns.
- **KnowGraph** (2024): Integrates domain knowledge with GNNs for anomaly detection on eBay (40M transactions) and LANL (1.6B events). Outperforms purely data-driven approaches.
- **GNS framework** (2021): GNN + LLM for ERP anomaly detection achieves 94% F1, 85% MTTD reduction. Explainable traces for 91% of detected anomalies.

### 4.3. Production GNN Deployment
- **Kumo.ai production guide** (2026): "The graph construction pipeline is often harder than the model itself." Batch inference is the most common production pattern. Pre-computed embeddings reduce serving to sub-1ms lookups.
- **Neo4j + PyG integration** (2025): Native `FeatureStore`/`GraphStore` interfaces. G-Retriever achieves 2x accuracy over standard RAG on Neo4j data.
- **FalkorDB + PyG** (2026): Zero-copy lazy loading, heterogeneous graph support, automatic node ID remapping. Drop-in replacement for any PyG remote backend.

### 4.4. Dashboard & Agent UX Patterns
- **Dashboard design patterns** (2026): 256px sidebar width, 64px collapsed, 4-6 KPIs above fold, CSS Grid with `auto-fill`.
- **Agent UI design** (2026): "The UI becomes the control plane for goals, permissions, workflow state, review, evidence." Separate activity panel from conversation thread.
- **Agentic UX patterns** (2026): "Plan-and-execute before any multi-step autonomous task." Streaming tool output, not just responses.
- **Kagan Agent UX Patterns** (Vol. 13, 2026): Multi-agent visualization via agent dashboards, graph visualization, swim lanes, aggregate progress.

---

## 5. What to Do Right Now

### 5A. Sidebar prototype changes (HTML)
1. Add inline SVG icons to all 16 nav items
2. Rename groups: Ingest, Validate, Run, System (with brand sub-labels)
3. Nest Practices and Evaluations under Agent Workspace
4. Add status badges (drift, blocked, held) to relevant nav items
5. Enrich footer with context health info
6. Add keyboard shortcut hints on hover

### 5B. GNN research direction (code)
1. Create `packages/gnn-runtime/` with PyG dependency
2. Write graph export utility: `neo4j → PyG HeteroData` (heterogeneous graph with node/edge type attributes)
3. Train Node2Vec baseline on the demo graph → use embeddings for similarity search
4. Build `GET /api/insights` endpoint returning: link suggestions, anomaly scores, community assignments
5. Add "Insights" page to Studio prototype showing GNN outputs

---

## 6. Decisions (Resolved)

### 6.1. Sidebar Group Names
**Decision:** Rename to task-oriented verbs with brand sub-labels.
- Ingest (*Schema & Knowledge*)
- Validate (*Rules & Compliance*)
- Run (*Agent & Queries*)
- System (*Config & Audit*)

**Rationale:** Agent UI research (2026) shows task-oriented navigation reduces cognitive load. Brand vocabulary preserved as sub-labels maintains Polanyi's scholarly identity.

### 6.2. GNN Package Location
**Decision:** New `packages/gnn-runtime/`.
**Rationale:** PyTorch/PyG dependency (~2GB) should not bloat `execution-runtime`. GNN has different lifecycle (batch schedule, model versioning, embedding caching). Clean separation: `gnn-runtime` depends on `execution-runtime` (reads KG schema), not the reverse.

### 6.3. Insights Surface
**Decision:** New sidebar item "Insights" nested under Knowledge Graph.
**Rationale:** GraphWise (2026) gives GNN risk scores their own dashboard section. Nesting under KG keeps related items together while maintaining task-oriented structure. The Insights page shows: link suggestions, drift alerts, communities, governance gaps, grounding quality score.

### 6.4. Implementation Priority
**Decision:** Sidebar first, then GNN.
**Rationale:** Sidebar is the navigation skeleton. GNN insights need a place to surface. Sidebar improvements are low-risk, high-visibility. GNN infrastructure depends on knowing the navigation structure. Sidebar provides status badge infrastructure that GNN will use.

---

## 7. Open Questions (Remaining)

1. **Model training approach:** Should we pre-train on the demo dataset only, or design for continual learning as contexts grow? (Recommendation: Start with pre-trained on demo, design API for continual fine-tuning.)

2. **GNN model selection:** Which specific GNN architecture for the demo dataset? (Recommendation: Start with GCN for simplicity, upgrade to GAT if attention weights provide useful interpretability for governance decisions.)

3. **Insights refresh cadence:** How often should GNN insights refresh? (Recommendation: Daily batch for demo, configurable for production. Graph changes trigger re-scoring.)

4. **Integration with existing endpoints:** How should GNN insights interact with `/api/align`, `/api/context`, `/api/schema`? (Recommendation: GNN reads from these endpoints, writes to `/api/insights`. No modification to existing endpoints.)

---

## 8. References

### GNN for Knowledge Graphs
- OL-KGC (2025): Ontology-enhanced KG completion using LLMs + GNN structural embeddings. arXiv:2507.20643
- Bayes-GNN (2025): Uncertainty-aware ontology analysis. 94.5% alignment accuracy, 85.7% node classification.
- SeSKGC (2026): Semantic-structural fusion for KG completion.
- Hierarchy-aware GNNs (2026): GNNs with ontology-derived semantic loss for KG embeddings.
- G2L-KGC (2025): GNN-to-LLM reasoning for coarse-to-fine KG completion.

### GNN for Enterprise Governance
- ADR framework (2025): Autonomous Data Reconciliation using GAT. F1=0.93.
- KnowGraph (2024): Domain knowledge + GNNs for anomaly detection on eBay/LANL datasets.
- GNS framework (2021): GNN + LLM for ERP anomaly detection. 94% F1, 85% MTTD reduction.
- Cognitive Bank (2026): FIBO-based KG + LLM + federated learning for climate risk.

### Production GNN Deployment
- Kumo.ai production guide (2026): Graph construction, batch inference, feature stores.
- Neo4j + PyG integration (2025): Native FeatureStore/GraphStore interfaces.
- FalkorDB + PyG (2026): Zero-copy lazy loading, heterogeneous graph support.
- NVIDIA GraphRAG (2025): G-Retriever achieving 2x accuracy over standard RAG.

### Dashboard & Agent UX
- Dashboard design patterns (2026): Sidebar, KPI strip, CSS Grid.
- Agent UI design (2026): Control plane, activity panel, approval gates.
- Agentic UX patterns (2026): Plan-and-execute, streaming tool output.
- Kagan Agent UX Patterns (Vol. 13, 2026): Multi-agent visualization.
- UI Potion Sidebar Navigation (2026): Responsive sidebar with collapsible groups.

### Financial Ontology
- FIBO (EDM Council): Global standard ontology for financial services.
- FinCaKG-Onto (2025): FIBO-integrated financial causality KG.
- Graphwise FIBO exploration (2025): Loading and reasoning with FIBO in GraphDB.
