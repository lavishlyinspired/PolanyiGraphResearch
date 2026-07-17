# Polanyi Works Studio — Prototype Additions Plan

**Status:** Research-driven proposal · **Depends on:** `polanyi-studio-prototype.html`, `polanyi-studio-ui-spec.md`, `PRODUCT.md`

---

## 0. Executive summary

The current prototype covers 15 screens across Ground/Govern/Operate/Platform. Research across neuro-symbolic AI (2025–2026), tacit knowledge management, metacognition in AI agents, knowledge graph UX, and practice engineering reveals **seven clusters of missing capability** that would make Polanyi Works not just a data catalog with an agent, but the first product that makes the neurosymbolic contract *architecturally visible* and treats *organizational tacit knowledge* as a first-class runtime concept.

---

## 1. The research findings (clustered)

### 1A. Going Meta — metacognition as a product surface

**Key sources:**
- *Deep Reasoning via Structured Meta-Cognition* (Light et al., arXiv 2605.11388, May 2026) — DOLORES agent constructs task-specific reasoning scaffolds; meta-reasoning is represented as executable decompositions
- *Meta-Reasoner* (arXiv 2502.19918) — dual-process architecture: LRM generates CoT, Meta-Reasoner provides strategic oversight via contextual bandits
- *Deep Search with Hierarchical Meta-Cognitive Monitoring* (Sun et al., arXiv 2601.23188, Jan 2026) — Fast Consistency Monitor + Slow Experience-Driven Monitor
- *MetaCognition Patterns for AI Agent Self-Monitoring* (Zylos Research, Mar 2026) — MAPE-K loop applied to agent runtimes: Monitor → Analyze → Plan → Execute, with dual observation (Governor quality + Session quality)
- *Me, Myself, and π — LLM Introspection* (Naphade et al., arXiv 2603.20276, Mar 2026) — Introspect-Bench evaluates genuine meta-cognition vs. text self-simulation; attention diffusion as mechanism
- *The Model Is Not the Product — MRA* (MindHYVE.ai, Mar 2026) — Metacognitive Reasoning Architecture: zero-parameter layer that reasons about *how to reason*, allocates compute by problem difficulty, runs adversarial verification

**What Polanyi lacks today:**
- No UI surface for *how the system reasons about its own reasoning*
- The Agent Workspace trace shows what happened, but not *why the system chose that reasoning strategy*
- No calibration view (confidence vs. actual accuracy)
- No "second-order" visibility: what rules did the meta-reasoner consider and reject?

**Prototype additions:**

#### 1A-1. Agent Reasoning Confidence Panel (Agent Workspace)
- Below the trace, add a **"Reasoning meta"** collapsible panel showing:
  - Strategy selection log: "Selected ReAct pattern (3 rules active → symbolic gate sufficient)"
  - Confidence calibration: last 20 answers vs. confidence scores, scatter plot
  - Resource allocation: tokens spent on planning vs. execution vs. verification
- Visual: monospace, ledger-style, moss/neural provenance chips on each entry
- Empty state: "Meta-reasoning logs appear after 5+ sessions"

#### 1A-2. Metacognitive Monitor Dashboard (new tab or sub-view under Overview)
- Inspired by the MAPE-K loop from Zylos Research
- Four panels matching the loop:
  - **Monitor:** Dual observation streams (Governor decisions + Session interactions) as parallel ledgers
  - **Analyze:** Anomaly detection — drift in agent behavior patterns, overconfidence flags, calibration score
  - **Plan:** Recommendations raised (advisory, not enforced) — "Agent is overconfident on JOIN-heavy queries. Consider increasing verification budget."
  - **Execute:** Recommendations accepted/rejected by human, with audit trail
- This makes "who watches the watchers" answerable in the UI

### 1B. Tacit Knowledge — Polanyi's core insight as a runtime concept

**Key sources:**
- *Tacit Knowledge Is Your Next Competitive Moat* (California Management Review, Mar 2026) — five actions: map, codify, embed in semantic structures, human-AI collaboration, leadership
- *We Know More Than We Teach Our Agents* (Ed Daniels, Medium, Apr 2026) — agentic systems can capture the gap between prescribed process and actual practice through ambient observation
- *From Knowledge Graphs to Practice Graphs* (Elmoukhliss, Medium, May 2026) — Practice Graph: reusable ways of doing, typed by mode of engagement (read/execute/compose), with learning loops
- *Knowledge Activation: AI Skills as Institutional Knowledge Primitive* (arXiv 2603.14805, Mar 2026) — Atomic Knowledge Units (AKUs): intent + procedure + tools + governance + continuations + validators, deployed at Yahoo (NPS +35, 2.6 hr/week saved)
- *Knowledge & Semantics Layer v1.0* (LinkedIn, May 2026) — enterprise knowledge + long-term memory + canonical ontology as three sub-corpora
- *Agentic Knowledge Fabric* (Broda, Medium, Mar 2026) — concept cards, policy cards, knowledge graphs compiled for agent consumption
- *Context Graphs* (Masood, Medium, Jan 2026) — governed context layer: entities, events, decisions, policies, evidence; "explanation packets" = answer + evidence paths + provenance + policy constraints

**What Polanyi lacks today:**
- No surface for *which expert knowledge patterns the agent has learned*
- No "Practice" concept — only rules and terms, not the *ways of doing* that agents and humans repeat
- No "explanation packet" view — the agent gives an answer but doesn't bundle evidence paths + policy constraints as a structured artifact
- The prompt registry shows what the agent sees, but not *which prompts were effective vs. which caused failures*

**Prototype additions:**

#### 1B-1. Practices View (new sidebar item under Operate)
- Inspired by Practice Graphs (Elmoukhliss) and AKUs (Yahoo paper)
- **Concept:** Reusable "ways of doing" that emerged from agent-human interaction
- Table columns: Practice name | Type (Content / Prompt / Tool / Process / Agent) | Source (how it was captured) | Activation count | Success rate | Version | Governance status
- Demo data: "Counterparty risk review workflow", "Revenue reconciliation pattern", "FIBO alignment strategy"
- Each row opens a drawer showing:
  - The practice node with its typed connections to terms, rules, documents
  - Activation history (like enforcement history for rules)
  - Version lineage (which human/AI interaction created it)
- This is the "we know more than we can tell" made visible — the agent's accumulated institutional knowledge

#### 1B-2. Explanation Packet View (Agent Workspace answer enrichment)
- After each agent answer, add a structured **"Evidence Packet"** panel:
  - **Answer** (the response text)
  - **Evidence paths** (graph traversal from answer → terms → rules → source documents)
  - **Policy constraints applied** (which rules gated the SQL, which passed, which blocked)
  - **Provenance chain** (schema-derived → LLM-enriched → declared, with specific version citations)
  - **Confidence & calibration** (model confidence, how many similar questions it answered correctly before)
- Visual: stacked panels with provenance chips, each expandable
- This is the "explanation packet" concept from Context Graphs research

#### 1B-3. Knowledge Activation Registry (Platform → Registry & Extensions → new tab)
- Inspired by AKUs (arXiv 2603.14805)
- A registry of "Atomic Knowledge Units" the system has codified
- Columns: AKU name | Intent | Tools bound | Governance constraints | Continuations (next steps) | Validators | Status (active/draft/deprecated)
- Each AKU shows as a mini-card, not just a table row
- This bridges the existing Skills panel with the new Practices concept

### 1C. Symbolic Seams — making the neurosymbolic contract architectural

**Key sources:**
- *Symbolic Seams for Composable Neuro-Symbolic Architectures* (Schuler et al., arXiv 2603.15087, Mar 2026) — four design commitments: typed boundary objects, evolvable constraint bundles, externalized reasoning traces, bounded change propagation
- *Forethought: Verifiable Reasoning from Neurosymbolic Primitive Programming* (arXiv 2607.04096, Jul 2026) — reasoning as explicit, verifiable programs; design-time verification; typed output contracts
- *TACET: Self-Distilling Neuro-Symbolic Cascade* (GitHub, 2026) — three-tier cascade (symbolic → KGE → LLM) with distillation downward; auditable Datalog proof trees
- *Post-LLM Architectures: Hybrid Neuro-Symbolic Systems in Production* (Fallbrook Research, Jan 2026) — four patterns: LLM as front end, symbolic as guardrail, KG as memory, formal planner as orchestrator
- *NEURON: Neuro-Symbolic Grounded Clinical Explainability* (arXiv 2605.01189, May 2026) — SNOMED ontology + SHAP + RAG → narrative explanation
- *Multiple Roles of Ontologies in Neuro-Symbolic Explanations* (Confalonieri & Guizzardi, 2025) — reference modelling, common-sense reasoning, knowledge refinement

**What Polanyi lacks today:**
- The Validator page shows verdicts, but doesn't show the *seam* where neural meets symbolic
- No visualization of the constraint bundle as a versioned, inspectable artifact
- No "decision receipts" — intermediate reasoning checkpoints during normal operation
- The trace shows steps, but doesn't mark which steps are at a *seam boundary* (neural→symbolic, symbolic→execution)
- No view of the three-tier cascade (if Polanyi adopts a TACET-like routing)

**Prototype additions:**

#### 1C-1. Symbolic Seam Visualization (Validator page enhancement)
- Redesign the Validator verdict display to explicitly show the seam:
  - **Boundary Object** panel: the typed input to the validator (SQL AST as structured data)
  - **Constraint Bundle** panel: the active rules as a versioned, inspectable list with version tags
  - **Decision Receipt** panel: per-constraint verdict with evidence, like a receipt
  - **Seam Version** badge: "v14 · 4 constraints · last validated 2h ago"
- Add a small **"Seam diagram"** in the Validator page header showing:
  - LLM → [neural seam] → SQL → [symbolic seam] → ValidateSQL → [execution seam] → ExecuteSQL
  - Each seam node clickable to inspect its constraints
- This makes the architectural principle visible

#### 1C-2. Constraint Bundle Inspector (Business Rules page)
- Each rule's detail panel should show it as a **versioned constraint**:
  - Version history (when created, when last enforced, enforcement count)
  - Constraint bundle membership (which other rules are in the same bundle)
  - Impact analysis: "If BR-001 is modified, 14 queries in the last 30d would need re-validation"
  - Regression test results (from eval suites that test this rule)
- Add a **"Bundle diff"** view: show what changed between v13 and v14 constraint bundles
- This makes constraint governance visible

#### 1C-3. Cascade Router View (new sub-view in Overview or Activity)
- If the system routes queries through a three-tier cascade (symbolic → KGE → LLM), show:
  - Current routing distribution: 60% symbolic, 25% KGE, 15% LLM
  - Cost amortization: blended cost per query over time
  - Distillation log: "3 new rules synthesized from LLM answers this week"
  - Proof tree for recent symbolic answers (Datalog-style)
- Visual: pipeline visualization with cost counters at each tier
- This is the TACET pattern made visible

### 1D. Expert Twin / Cognition Modeling

**Key sources:**
- *AI Expert Twin: Capturing Expert Cognition* (arXiv 2605.01401, May 2026) — three-layer representation: procedural actions, semantic concepts, decision processes; value-laden preferences and trade-offs
- *Environment Maps for Long-Horizon Agents* (arXiv 2603.23610, Mar 2026) — contexts, actions, workflows, tacit knowledge as four components; tacit knowledge = domain definitions + procedural hints
- *Leveraging LLMs for Tacit Knowledge Discovery* (arXiv 2507.03811, Jul 2025) — agent-based framework for iterative knowledge reconstruction through organizational networks

**What Polanyi lacks today:**
- No representation of *how* experts in the organization make decisions (beyond rules)
- No "expert twin" concept — the agent doesn't learn from specific experts' patterns
- No way to see *which decisions were influenced by which expert's patterns*
- No procedural/semantic/decision layer decomposition

**Prototype additions:**

#### 1D-1. Expert Decision Patterns (sub-view in Practices)
- For each Practice, show the three-layer decomposition:
  - **Procedural layer:** step sequence (what the expert does)
  - **Semantic layer:** which terms, concepts, and relationships they invoke
  - **Decision layer:** what trade-offs and value-laden preferences shape their choices
- Visual: three stacked panels in the practice drawer
- Example: "Risk review workflow" shows:
  - Procedural: check sanctions → aggregate exposure → flag high-risk → report
  - Semantic: Counterparty, High-Risk Country, Notional Amount, BR-001
  - Decision: "prefer false positives over false negatives for sanctions" (cautious stance)

#### 1D-2. Decision Trace Attribution (Agent Workspace)
- When the agent makes a decision, attribute it to a pattern:
  - "This query pattern follows the 'risk review' practice, established by akash on 2026-07-10"
  - Show confidence that this attribution is correct
  - Show alternatives considered: "Also matched 'revenue reconciliation' pattern (0.62 similarity)"
- This makes the agent's institutional knowledge inheritable

### 1E. Knowledge Graph UX — beyond the basic explorer

**Key sources:**
- *Neo4j Bloom* features (2025–2026): force-based layout, near-natural language search, perspective-based rendering, graph pattern search, scene interactions, accessibility improvements
- *Knogra* knowledge graph explorer: scenes, spatial transitions, guided walks, AI-assisted gap detection
- *NODUSmap*: dual-layer comparison, OWL/RDF export, 3D visualization, layer alignment
- *MindTrellis* (arXiv 2604.23129, Apr 2026): co-creating knowledge structures with AI through interactive visual exploration

**What Polanyi lacks today:**
- The graph canvas is a static SVG with hardcoded positions
- No interactive exploration (expand neighbors, filter, zoom, pan)
- No "perspective" concept (different views of the same graph for different personas)
- No guided walk / story mode for the graph
- No gap detection (where is knowledge missing?)
- No dual-layer comparison (e.g., compare current graph vs. previous version)

**Prototype additions:**

#### 1E-1. Interactive Graph Controls (Knowledge Graph page)
- Add simulated interactive elements to the graph canvas:
  - **Zoom/fit controls** in the bottom-right corner
  - **Layout toggle:** force-based / hierarchical / circular
  - **Filter drawer** with node type checkboxes (Entity / Term / Document / Mention)
  - **Search bar** above the graph: "find nodes matching: counterparty"
  - **Minimap** in the bottom-right showing the full graph with viewport indicator
- Even as static HTML, these can be visually represented

#### 1E-2. Perspective Selector (Knowledge Graph page)
- Like Neo4j Bloom's Perspectives, add a dropdown:
  - **"Glossary View"** — terms and their FIBO alignments, with definition quality badges
  - **"Compliance View"** — rules and their enforcement patterns, with violation hotspots
  - **"Document View"** — documents and their mention chains, with resolution status
  - **"Lineage View"** — schema → term → ontology → rule → query flow
- Each perspective shows different node colors, filters, and detail panels
- This is the "perspective-based rendering" pattern from Neo4j Bloom

#### 1E-3. Knowledge Gap Detector (Knowledge Graph page)
- Add a **"Gaps"** panel showing:
  - Terms without FIBO alignment (count, list)
  - Columns without semantic terms (drift)
  - Documents with unresolved mentions
  - Rules without enforcement history
  - Rules that reference terms not in the glossary
- Each gap is actionable: "Align Revenue to FIBO → [button]"
- This is the "gap detection" from Knogra and MindTrellis

#### 1E-4. Graph Story / Guided Walk (Knowledge Graph page)
- A **"Story mode"** toggle that shows a step-by-step narrative:
  1. "Start with the schema: 5 tables connected by foreign keys"
  2. "Derive entities and relationships deterministically"
  3. "Map columns to glossary terms — 28 mapped, 4 unmapped"
  4. "Align to FIBO — 24 exact matches, 3 need review, 1 rejected"
  5. "Apply business rules — 4 rules enforced on every query"
  6. "Ground the agent — the trace shows the full loop"
- Each step highlights the relevant subgraph
- This teaches the product's value proposition through the graph

### 1F. Audit, Compliance, and Governance Surface

**Key sources:**
- *Context Graphs* (Masood, Jan 2026) — "the wall isn't missing data; it's missing decision traces"
- *Ontology Imperative* (Verhelst, LinkedIn, Dec 2025) — enterprise knowledge graphs as strategic IP, governance of RDF vs. proprietary formats
- *AI Governance at Scale* (LinkedIn, 2025–2026) — RBAC insufficient, need task-scoped grants with expiry
- *Context Graphs* — bitemporal support (valid time + transaction time), W3C PROV provenance

**What Polanyi lacks today:**
- The Changes page has an audit ledger, but it's minimal
- No bitemporal view (when was this fact true in reality vs. when was it recorded)
- No compliance dashboard showing governance posture across the system
- No role-based view (what can a steward see vs. a platform engineer vs. an auditor)
- No export/audit-trail download capability

**Prototype additions:**

#### 1F-1. Governance Posture Dashboard (Overview page enhancement)
- Add a **"Governance posture"** card to the Overview:
  - Terms: X/32 curated, Y/32 LLM-drafted, Z/32 schema-derived
  - Rules: X enforced, Y with no enforcement history
  - Alignments: X accepted, Y pending review, Z rejected
  - Documents: X published, Y held, Z with unresolved mentions
  - Overall score: "Governance maturity: Level 3/5 — terms curated, rules enforced, alignments reviewed"
- Each metric is a meter, like the existing coverage meters

#### 1F-2. Audit Trail Export (Changes page)
- Add an **"Export audit trail"** button that generates a downloadable report:
  - Date range selector
  - Filter by event type (generate, publish, align, curate, validate, ask)
  - Output format: JSON-LD with W3C PROV provenance
  - Includes: timestamp, actor, action, object, result, version
- Visual: a download button with a format selector

#### 1F-3. Bitemporal Timeline (Changes page)
- Show the version timeline with dual timestamps:
  - **Valid time:** when the fact became true in the real world (e.g., "BR-001 was always true, declared 2026-07-10")
  - **Transaction time:** when it was recorded in the system (e.g., "recorded in v14, generated 2026-07-15")
- Visual: dual-lane timeline, one for each timestamp type
- This is from the Context Graphs bitemporal pattern

### 1H. Neo4j Graph Analytics — under-utilized database capabilities

**Key sources:**
- Neo4j GDS Library v2.13 (2025–2026) — 65+ graph algorithms: PageRank, Louvain, Node2Vec, betweenness centrality, node similarity, shortest path
- Neo4j Vector Index (5.x+) — native cosine/euclidean similarity search, hybrid search (vector + full-text via WRRF)
- APOC Core — batch operations (`CALL IN TRANSACTIONS`), schema introspection (`apoc.meta.schema`), path traversals
- Neo4j Community Edition — all GDS algorithms included, limited to 4 CPU cores and 3 models (sufficient for Polanyi's ~50-node graph)
- GDS Python Client (`graphdatascience` v1.22) — programmatic graph projection, algorithm execution, result streaming

**What Polanyi lacks today:**
- Neo4j used as dumb key-value store — basic MERGE writes, 2 simple reads, full-graph extraction into Python
- Python `gnn-runtime/` reimplements Node2Vec, KMeans, cosine similarity that GDS provides natively (10-100x slower)
- No uniqueness constraints on Entity.name, Term.term, Document.source — MERGE operations slower than necessary
- No full-text index for fuzzy search across entity names and term definitions
- No vector index for similarity search — cosine matrix computed in Python after full extraction
- No PageRank, betweenness centrality, or Louvain community detection (all available natively in GDS)
- Old `session.run()` API used everywhere — no managed transactions with auto-retry
- Graph extraction runs 145 queries (one per node×edge×node type combo) — GDS graph projection does this in 1 query

**Prototype additions:**

#### 1H-1. Graph Analytics Page (new sidebar item under Intelligence)
- **KPI Cards (4 across):**
  - PageRank Score — top entity name + score, distribution sparkline
  - Community Count — Louvain clusters detected, average coherence
  - Centrality Score — highest betweenness entity, bridge node count
  - Graph Density — actual edges / possible edges percentage
- **Algorithm Runner Panel:**
  - Dropdown selector: PageRank / Louvain / Betweenness Centrality / Node2Vec / Node Similarity
  - "Run Algorithm" button with loading state
  - Results table: node name, score, community assignment, PageRank
  - Export to JSON button
- **Centrality Heatmap:**
  - 8-column grid of entity cards, color-coded by betweenness score
  - Red = high centrality (bridge nodes), green = low
  - Same visual pattern as existing Anomaly Scores heatmap
- **Community Map:**
  - Color-coded entity list grouped by Louvain community ID
  - Each community card shows: ID, member count, average coherence, dominant node type
  - Click community → highlight members in Knowledge Graph view
- **Graph Statistics Table:**
  - Node count by type (Entity, Term, Document, Mention)
  - Edge count by type (RELATES_TO, DESCRIBES, MENTIONS, REFERS_TO, ALIGNED_TO)
  - Average degree, max degree, isolated node count
  - Last GDS projection timestamp

#### 1H-2. Vector Search Page (new sidebar item under Intelligence)
- **Search Panel:**
  - Text input: "Search entities by meaning..."
  - Dropdown: "Similarity function: cosine / euclidean / inner product"
  - Slider: "Top K results: 1–50" (default 10)
  - "Search" button
- **Results Table:**
  - Columns: Entity name | Similarity score | Community | PageRank | FIBO alignment status
  - Score pill color: green (>0.8), amber (0.5-0.8), red (<0.5)
  - Click entity → navigate to Knowledge Graph view with entity selected
- **Embedding Visualization (2D):**
  - Scatter plot showing t-SNE/PCA projection of all entity embeddings
  - Dots colored by Louvain community
  - Dot size proportional to PageRank score
  - Hover tooltip: entity name, score, community
  - This is a static SVG representation (no interactive canvas needed for prototype)
- **Recent Searches Panel:**
  - Last 5 search queries with result counts
  - Click to re-run search

#### 1H-3. Enhanced Intelligence Sidebar Group
- Rename existing "Intelligence" group to include analytics sub-items:
  ```
  Intelligence/
    ├── Graph Insights       (existing — GNN link suggestions, drift, communities)
    ├── Anomaly Scores       (existing — structural + embedding anomalies)
    ├── Alignment Quality    (existing — FIBO coverage, semantic drift timeline)
    ├── Graph Analytics      ← NEW (GDS algorithms dashboard)
    └── Vector Search        ← NEW (similarity search UI)
  ```
- Add keyboard shortcuts: `G T` for Graph Analytics, `G U` for Vector Search

#### 1H-4. Updated Insights Page with GDS Metrics
- Add GDS-computed metrics to existing Graph Insights page:
  - Replace Python-computed grounding score with GDS-native graph density
  - Add PageRank-based entity importance to link suggestion scoring
  - Add Louvain community labels to community cards (replace KMeans labels)
  - Add betweenness centrality to anomaly detection (bridge node identification)
- New KPI card: "GDS Projection" with status (active/stale) and last refresh time

### 1G. Interaction Polish and Missing Chrome

**Key sources:**
- Neo4j Bloom accessibility improvements (keyboard navigation for graph, analytics, slicer, zoom, legend)
- WCAG 2.2 AA requirements (PRODUCT.md)
- Linear/Stripe command palette patterns

**What the prototype lacks:**
- No skeleton loading states
- No error states
- No empty states with guidance
- No keyboard shortcuts beyond ⌘K
- No breadcrumbs or page context indicators
- No "what changed since last visit" indicator

**Prototype additions:**

#### 1G-1. Skeleton Loading States
- For each table/panel, add a CSS class `.skeleton` that shows animated placeholder rows
- Apply to: glossary table, activity ledger, eval suites, connections table
- Visual: 3–5 rows of gray animated rectangles at 50% opacity

#### 1G-2. Empty States with Guidance
- For each page, add an empty state variant:
  - **No context yet:** "Connect a source and generate context to get started" with a step-by-step illustration
  - **No rules yet:** "Declare rules as JSON; predicates become both agent guidance and validation checks"
  - **No evaluations yet:** "Run your first eval suite to establish a baseline"
  - **No documents yet:** "Ingest documents to feed the semantic layer"
- Each empty state has an illustration (simple SVG) and a primary action button

#### 1G-3. Keyboard Shortcut Overlay
- Add a **"?"** shortcut that opens a keyboard shortcuts overlay:
  - `⌘K` — Command palette
  - `G` then `O` — Go to Overview
  - `G` then `S` — Go to Sources
  - `E` — Toggle editor (Validator)
  - `?` — Show shortcuts
  - `Esc` — Close drawer/dialog
- Visual: modal dialog with a table of shortcuts, similar to GitHub's

#### 1G-4. Page Context Indicator
- In the topbar, add a subtle indicator showing:
  - Context version badge: "v14"
  - "Last generated: 2h ago"
  - "1 drift detected" (if any)
- This keeps the user oriented without cluttering the page

---

## 2. Priority and implementation grouping

### Phase 1 — Core additions (highest impact, lowest complexity)

| # | Addition | Complexity | Impact | Rationale |
|---|----------|-----------|--------|-----------|
| 1C-1 | Symbolic Seam Visualization | Medium | Very High | Core differentiator — makes the neurosymbolic contract visible |
| 1B-2 | Explanation Packet View | Medium | Very High | "Answer + evidence + provenance" is the trust mechanism |
| 1G-2 | Empty States with Guidance | Low | High | Makes every page usable from day one |
| 1G-1 | Skeleton Loading States | Low | High | Professional polish, perceived performance |
| 1E-3 | Knowledge Gap Detector | Low | High | Immediately actionable, shows value |

### Phase 2 — Advanced metacognition and practices

| # | Addition | Complexity | Impact | Rationale |
|---|----------|-----------|--------|-----------|
| 1A-1 | Agent Reasoning Confidence Panel | Medium | High | "Going meta" is the differentiator |
| 1B-1 | Practices View | High | Very High | Institutional knowledge as first-class concept |
| 1C-2 | Constraint Bundle Inspector | Medium | Medium | Makes governance tangible |
| 1E-2 | Perspective Selector | Medium | Medium | Different users need different views |

### Phase 3 — Enterprise governance and advanced UX

| # | Addition | Complexity | Impact | Rationale |
|---|----------|-----------|--------|-----------|
| 1F-1 | Governance Posture Dashboard | Medium | High | Enterprise trust story |
| 1D-1 | Expert Decision Patterns | High | Medium | Advanced organizational learning |
| 1E-4 | Graph Story / Guided Walk | Medium | Medium | Onboarding and value demonstration |
| 1F-2 | Audit Trail Export | Low | Medium | Compliance requirement |
| 1G-3 | Keyboard Shortcut Overlay | Low | Low | Polish |

### Phase 4 — Neo4j analytics and future research surfaces

| # | Addition | Complexity | Impact | Rationale |
|---|----------|-----------|--------|-----------|
| 1H-1 | Graph Analytics Page | Medium | High | GDS algorithms dashboard — PageRank, Louvain, centrality |
| 1H-2 | Vector Search Page | Medium | High | Similarity search UI with embedding visualization |
| 1H-3 | Enhanced Intelligence Sidebar | Low | Medium | Sub-items for analytics + vector search |
| 1H-4 | Updated Insights with GDS Metrics | Medium | Medium | Replace Python-computed with GDS-native |
| 1A-2 | Metacognitive Monitor Dashboard | Very High | High | "Who watches the watchers" — deep differentiator |
| 1C-3 | Cascade Router View | High | Medium | TACET-style cost optimization visibility |
| 1B-3 | Knowledge Activation Registry | Medium | Medium | AKU concept for enterprise |
| 1D-2 | Decision Trace Attribution | High | Medium | Expert twin pattern |
| 1E-1 | Interactive Graph Controls | High | Medium | Requires canvas interaction library |
| 1F-3 | Bitemporal Timeline | Medium | Low | Niche but academically rigorous |
| 1G-4 | Page Context Indicator | Low | Low | Polish |

---

## 3. What to add to the HTML prototype right now

For the prototype specifically, the following additions should be implemented as static HTML mockups:

### 3A. Must-have for the prototype

1. **Symbolic Seam diagram** in Validator page header — a simple SVG showing the LLM → SQL → Validate → Execute pipeline with labeled seam boundaries
2. **Explanation Packet panel** below the Agent Workspace answer — stacked evidence paths, policy constraints, provenance chain
3. **Empty state** for Documents page (currently has content, but add an "if empty" variant below)
4. **Knowledge Gap card** on Overview page — a new panel showing gap counts with action buttons
5. **Practices tab** in sidebar under Operate — even if just a skeleton table with 3 demo rows

### 3B. Nice-to-have for the prototype

6. **Confidence panel** below Agent Workspace trace — "Reasoning meta" collapsible
7. **Constraint Bundle detail** in Business Rules drawer — version history and impact
8. **Perspective selector** dropdown on Knowledge Graph page
9. **Skeleton loading** CSS class applied to one or two tables
10. **Keyboard shortcut overlay** triggered by "?" key

### 3C. Neo4j analytics additions (from Phase 4)

11. **Graph Analytics page** — KPI cards (PageRank, communities, centrality, density), algorithm runner dropdown, centrality heatmap, community map, graph statistics table
12. **Vector Search page** — search input with similarity function selector, results table with score pills, 2D embedding scatter plot (static SVG), recent searches panel
13. **Enhanced Intelligence sidebar** — add Graph Analytics (`G T`) and Vector Search (`G U`) sub-items with keyboard shortcuts
14. **Updated Insights page** — add GDS projection status card, PageRank importance in link suggestions, Louvain labels in community cards

### 3D. Skip for now (complexity too high for static HTML)

- Interactive graph controls (needs canvas library)
- Metacognitive Monitor Dashboard (needs real data)
- Cascade Router View (needs real cascade)
- Bitemporal timeline (needs real temporal data)
- Full Practices View with drawer detail (needs significant new mock data)

---

## 4. Design tokens needed

All additions should use existing tokens. New tokens only if needed:

```css
/* If adding seam diagram */
--seam: #6c7362;          /* neutral for seam boundaries */
--seam-active: var(--moss); /* when seam is being inspected */

/* If adding confidence panel */
--confidence-high: var(--good);
--confidence-mid: var(--warn);
--confidence-low: var(--bad);

/* If adding graph analytics / vector search */
--gds-primary: #008cc1;   /* Neo4j blue for GDS-related elements */
--gds-secondary: #19c679; /* Neo4j green for success/active states */
--centrality-high: #dc2626; /* red for high betweenness (bridge nodes) */
--centrality-low: #22c55e;  /* green for low betweenness */
--community-1: #7c3aed;   /* purple for community 1 */
--community-2: #2563eb;   /* blue for community 2 */
--community-3: #16a34a;   /* green for community 3 */
--community-4: #d97706;   /* amber for community 4 */
--community-5: #dc2626;   /* red for community 5 */
--vector-high: #16a34a;   /* green for high similarity (>0.8) */
--vector-mid: #d97706;    /* amber for medium similarity (0.5-0.8) */
--vector-low: #dc2626;    /* red for low similarity (<0.5) */
```

No new fonts, no new component patterns — extend chips, stamps, panels, meters, and tables.

---

## 5. Research sources consulted

### Academic papers (2025–2026)
1. Light et al., "Deep Reasoning in General Purpose Agents via Structured Meta-Cognition" (arXiv 2605.11388, May 2026)
2. "Meta-Reasoner: Dynamic Guidance for Optimized Inference-time Reasoning" (arXiv 2502.19918)
3. Sun et al., "Deep Search with Hierarchical Meta-Cognitive Monitoring" (arXiv 2601.23188, Jan 2026)
4. Naphade et al., "Me, Myself, and π: Evaluating and Explaining LLM Introspection" (arXiv 2603.20276, Mar 2026)
5. Schuler et al., "Beyond Monolithic Models: Symbolic Seams for Composable Neuro-Symbolic Architectures" (arXiv 2603.15087, Mar 2026)
6. "Forethought: Verifiable Reasoning from Neurosymbolic Primitive Programming" (arXiv 2607.04096, Jul 2026)
7. "Knowledge Activation: AI Skills as the Institutional Knowledge Primitive" (arXiv 2603.14805, Mar 2026)
8. "AI Expert Twin: Capturing Expert Cognition" (arXiv 2605.01401, May 2026)
9. "Environment Maps for Long-Horizon Agents" (arXiv 2603.23610, Mar 2026)
10. "Leveraging LLMs for Tacit Knowledge Discovery" (arXiv 2507.03811, Jul 2025)
11. "MindTrellis: Co-Creating Knowledge Structures with AI" (arXiv 2604.23129, Apr 2026)
12. Confalonieri & Guizzardi, "Multiple Roles of Ontologies in Neuro-Symbolic Explanations" (2025)
13. "NEURON: Neuro-Symbolic Grounded Clinical Explainability" (arXiv 2605.01189, May 2026)
14. Wei & AbdAlmageed, "Neuro-Symbolic Framework for Autonomous Driving" (arXiv 2603.12421, Mar 2026)
15. "TACET: Self-Distilling Neuro-Symbolic Cascade" (GitHub, 2026)

### Industry sources
16. Zylos Research, "MetaCognition Patterns for AI Agent Self-Monitoring" (Mar 2026)
17. MindHYVE.ai, "The Model Is Not the Product — MRA" (Mar 2026)
18. Fallbrook Research, "Post-LLM Architectures: Hybrid Neuro-Symbolic Systems in Production" (Jan 2026)
19. California Management Review, "Tacit Knowledge Is Your Next Competitive Moat" (Mar 2026)
20. Elmoukhliss, "From Knowledge Graphs to Practice Graphs" (May 2026)
21. Broda, "Agentic Knowledge Fabric" (Mar 2026)
22. Masood, "Context Graphs: A Practical Guide" (Jan 2026)
23. Daniels, "We Know More Than We Teach Our Agents" (Apr 2026)
24. Verhelst, "The Ontology Imperative" (LinkedIn, Dec 2025)
25. Connected Data, "How to Make Tacit Knowledge Accessible" (Apr 2026)
26. Sriram, "Knowledge & Semantics Layer v1.0" (May 2026)

### Products studied
27. Neo4j Bloom (2025–2026 releases) — perspective-based rendering, graph pattern search, accessibility
28. Knogra — scenes, spatial transitions, guided walks
29. NODUSmap — dual-layer comparison, OWL/RDF export
30. CoExplorer Workbench — knowledge mesh from expert dialogue
31. Polanyi Stack (GitHub) — tacit knowledge to agent skills
32. LangSmith / Langfuse — agent observability and evaluation
33. Forethought — neurosymbolic reasoning programs with design-time verification
34. Neo4j GDS Library v2.13 (2025) — PageRank, Louvain, Node2Vec, betweenness centrality, node similarity
35. Neo4j Vector Index (5.x+) — cosine/euclidean similarity, hybrid search (vector + full-text WRRF)
36. Neo4j APOC Core — batch operations, schema introspection, path traversals
37. GDS Python Client v1.22 — programmatic graph projection, algorithm execution
38. Kumo.ai production patterns (2026) — batch GNN inference, graph construction pipeline
39. GraphWise Zenia (2026) — GNN risk scores with live heat maps, independent intelligence surfaces
40. Agent UI Research (2026) — UI as control plane for goals, permissions, workflow state
41. Kagan Agent UX Patterns Vol. 13 (2026) — multi-agent dashboards, always-visible intelligence
42. Dashboard Design Patterns (2026) — 240-280px sidebar, 4-6 KPIs above fold, information density
