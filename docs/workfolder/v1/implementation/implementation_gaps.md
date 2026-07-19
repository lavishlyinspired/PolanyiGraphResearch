# Implementation Gaps: Prototype vs. Checklist

**Purpose:** Maps every page and shared component in `docs/design/polanyi-studio-prototype.html` against what's been built (checklist + implementation files) and what's still missing. Serves as the authoritative gap list for remaining slices.

**Date:** 2025-07-18

---

## Prototype Page Inventory (16 pages)

The prototype defines these pages via `VIEWS = ["overview","sources","model","documents","rules","ontology","validator","changes","agent","evals","graph","insights","console","activity","capabilities","settings"]`.

### Built (6 pages)

| # | Page | Checklist Story | Status | Notes |
|---|---|---|---|---|
| 1 | Validator | S1 | ✅ Done | 3 slices complete, 20/20 tests, 45 Stryker kills |
| 2 | Query Console (SQL/Cypher/SPARQL) | S2, S3, S4 | ✅ Done | 33/33 tests, state persists across tabs |
| 3 | Semantic Model (Glossary) | S5 | ✅ Done | Table + term drawer, governing rules derived |
| 4 | Business Rules | S6 | ✅ Done | Table + rule detail, read-only |
| 5 | Data Sources + Schema Browser | S7 | ✅ Done | Sources table + schema with PK/FK |
| 6 | App Shell (sidebar nav) | S1-S4 integration | ✅ Done | Validator ↔ Query Console wiring |

### Not Built (10 pages)

| # | Page | Checklist Story | Backend Status |
|---|---|---|---|
| 7 | Overview | S14 (last) | Partial — individual endpoints exist, no aggregation |
| 8 | Agent Workspace | S10 | Mostly ready — `/api/ask` + session memory exist; Evidence Packet confidence panels have zero backend (hard descope) |
| 9 | Knowledge Graph | S11 + S11b-e | Partial — `materialize` + `RunCypher` exist; NVL viz + 5 perspectives need building |
| 10 | Documents | S9 | Partial — ingest endpoint exists; no list, no mention viewer, no highlighted doc view |
| 11 | Ontology · FIBO | S8 + S8b | Partial — search/expand/reason exist; per-alignment accept/reject missing |
| 12 | Changes | Parking lot | Zero backend — no version snapshot, no diff, no audit store |
| 13 | Evaluations | Parking lot | Zero backend — spike first (5 deterministic cases) |
| 14 | Graph Insights | Parking lot | Zero backend — prototype labels "experimental, not wired" |
| 15 | Registry & Extensions | S12 | Partial — `/api/capabilities` exists; skills/connectors/prompts tabs need endpoints |
| 16 | Settings | S13 | Partial — `/api/health` has some fields; needs extending |

---

## Backend Gaps

### Small Effort (1-2 days each)

| Gap | Blocks | What Exists | What's Missing |
|---|---|---|---|
| Per-alignment accept/reject endpoint | S8b | `POST /api/context/align` runs whole alignment pass, returns aggregate list | `POST /api/context/align/{term}/accept` and `…/reject` — acts on one candidate, persists decision |
| `/api/health` extensions | S13 (Settings) | `/api/health` returns `{status, llm_mode}` | Extend to include: GraphDB connectivity + repo, Neo4j connectivity + n10s status, LLM key + model name, SHACL gate status, skills directory count, artifact store path |
| Capabilities registry extensions | S12 (Registry tabs) | `GET /api/capabilities` exists | Skills, Connectors, Prompts, Knowledge Units tabs need structured data per category (read-only views of config/filesystem) |
| Agent/workflow metadata endpoints | S12 (Registry — Agents tab) | `SemanticAgent` exists in code, LangGraph graph def exists | `GET /api/agents` (list agents + tools), `GET /api/workflows` (list pipelines + status) |
| Prompt registry endpoint | S12 (Registry — Prompts tab) | Prompts hardcoded in Python modules | `GET /api/prompts` (list prompts + source location + pinned version) — read-only, edit deferred to Changes |

### Medium Effort (3-5 days each)

| Gap | Blocks | What Exists | What's Missing |
|---|---|---|---|
| Document list + detail endpoints | S9 | `POST /api/documents/ingest` (write only) | `GET /api/documents` (list ingested docs + status + mention counts), `GET /api/documents/{id}` (full detail with resolved mentions) — needs a document store (even JSON/file-based) |
| Mention resolution viewer | S9 (document detail) | Ingestion pipeline extracts + resolves mentions | Endpoint returning document text with mention spans annotated (term, resolved/unresolved, linked rule) — the "excerpt with highlights" view |
| Enforcement history / run log | S12 (Changes audit), S14 (Overview verdicts), S11 Compliance | `POST /api/validate` returns verdict but doesn't store it | Append-only run-record store: every validation/exec/ask logs timestamp + SQL + verdict + rules checked + duration + tokens/cost; `GET /api/runs` (filterable), `GET /api/runs/stats` (30d counts per rule) |
| Overview aggregation endpoint | S14 (Overview) | Individual endpoints: `/api/sources`, `/api/context`, `/api/rules`, `/api/health`, `/api/validate` | `GET /api/overview` aggregating: pipeline stage counts, recent verdicts ledger, coverage metrics, knowledge gaps, governance posture, runtime health |

### Large Effort (1-2 weeks each)

| Gap | Blocks | What Exists | What's Missing |
|---|---|---|---|
| Changes subsystem | S12 (Changes page) | `POST /api/context/generate` produces new version; `GET /api/context` returns current | Version store (each generation stamps a version), `GET /api/changes/versions` (list), `GET /api/changes/diff?v1=&v2=` (semantic diff: added/edited/removed terms, rules, alignments), `GET /api/changes/audit` (immutable audit ledger) |
| Observability runtime | Activity page (parking lot) | `packages/observability-runtime/` — zero `.py` files, placeholder only | Run-record capture (duration, tokens, cost), `/api/activity` endpoint, cost-by-stage rollup |
| Evaluations subsystem | S13 (Evaluations page) | Nothing — confirmed zero code | Eval suite store, case store, runner (deterministic `validate_sql` cases first, LLM-as-judge later), `GET /api/evals/suites`, `POST /api/evals/run`, `GET /api/evals/results` |
| Graph Insights / GDS wiring | S11 (Graph Insights page) | `packages/gnn-runtime` — orphaned NumPy spike, no GDS, no vector index, no tests | Decision first: wire real Neo4j GDS (PageRank, Louvain, betweenness, FastRP) or kill; vector index for similarity; anomaly detection; link suggestions |

---

## Frontend Gaps

### Missing Shared Components

| Component | Where Used in Prototype | Notes |
|---|---|---|
| Command palette (`Cmd+K`) | Every page — search & jump to page, term, rule, capability | Keyboard-triggered dialog with fuzzy search |
| Keyboard shortcuts dialog | `?` key — shows all shortcuts | Simple modal with shortcut grid |
| Notifications bell + popover | Top bar — schema drift, SHACL-held doc, pending reviews | Badge count + dropdown with actionable alerts |
| Toast messages | Ephemeral feedback (copy, save, error) | Bottom-center auto-dismissing |
| Sidebar footer | Every page — context health, version, drift count, Polanyi quote | Static-ish, reads from `/api/health` + context |
| Top bar (context switcher + beacons) | Every page — shows `demo.db · financial-demo v14`, service status dots | Reads from `/api/health` + `/api/sources` |
| Filter chips pattern | Activity page (filter by type), could be reused | Pressable pill buttons with `aria-pressed` |

### Missing Page-Specific UI

| Page | Missing Frontend |
|---|---|
| Overview | Pipeline rail (5-stage horizontal), recent verdicts ledger, 14-day mini chart, coverage meters, knowledge gaps list, governance posture, runtime health table |
| Agent Workspace | Session history sidebar, chat composer, reasoning trace (9-step timeline with pin colors), evidence packet, ground-line chips |
| Knowledge Graph | SVG/NVL graph canvas, perspective selector (5 tabs), inspector panel, embedded Cypher console, guided walk |
| Documents | Pipeline flow visualization (parse→extract→resolve→SHACL→publish), document viewer with `<mark>` highlighted terms, mention summary |
| Ontology · FIBO | 3-panel alignment queue (needs-review with Accept/Reject, auto-aligned, rejected), hierarchy & reasoning panel |
| Changes | Semantic diff view (+/~/- markers), version list, audit ledger, review queue with approve/reject |
| Evaluations | Eval suite table, case detail (v13 vs v14 comparison), version comparison table |
| Graph Insights | 4 tabs (Overview, Anomalies, Communities & Centrality, Similarity Search), graph health meters, anomaly log |
| Registry & Extensions | 6 tabs (Capabilities, Skills, Agents & Workflows, Connectors, Prompts, Knowledge Units), agent topology SVG, skill YAML viewer |
| Settings | LLM config table, backends status table |

---

## Effort Tiers

| Tier | Items | Total Estimate |
|---|---|---|
| **Small** (1-2 days) | Accept/reject endpoint, health extensions, registry endpoints, prompt endpoint | ~1 week |
| **Medium** (3-5 days) | Document list/detail, mention viewer, enforcement history, overview aggregation | ~2-3 weeks |
| **Large** (1-2 weeks) | Changes subsystem, observability runtime, evaluations (spike first), graph insights (spike first) | ~4-6 weeks |

---

## Recommended Execution Order

| Priority | Gap | Rationale |
|---|---|---|
| 1 | Per-alignment accept/reject | Unblocks S8b, small, cheap win |
| 2 | Document list + detail + mention viewer | Unblocks S9, medium effort, high user value |
| 3 | Enforcement history / run log | Unblocks Overview verdicts + Compliance perspective + Activity — foundational for many pages |
| 4 | `/api/health` extensions | Unblocks Settings, trivial |
| 5 | Overview aggregation | Unblocks S14, pulls from existing data |
| 6 | Changes subsystem | Unblocks S12 (Changes page), new subsystem but high trust/audit value |
| 7 | Evaluations spike | Unblocks S13, must spike before committing to full build |
| 8 | Observability runtime | Foundational but can be deferred behind run-log |
| 9 | Graph Insights spike | GDS wiring decision — spike first, implement only if justified |
| 10 | Registry/Settings read endpoints | Lowest priority, mostly cosmetic |

---

## Agentic Enterprise Benchmark (July 2026)

**Date:** 2025-07-18
**Sources:** C3 AI, Google Gemini Enterprise Agent Platform, Databricks Agent Bricks, Kore.ai Artemis, Neo4j Knowledge Layer, Impetus Context Fabric, Jedify, BDB (Business Data Backbone), Fluree, Graphwise, Palantir Foundry/AIP, Aegis-DQ, Amazon AutoQ.

### Key Finding: The Prototype Is a Human-Operated Dashboard; Industry Has Moved to Autonomous Agents with Governance Built In

The 16-page prototype assumes a data steward clicks through pages for every operation (alignment accept/reject, document ingestion, query validation, evaluation runs). The 2026 standard is autonomous agents that act with governance baked in — not humans clicking through workflows.

### Manual Steps vs. Industry Standard

| Prototype Pattern | What 2026 Platforms Do Instead |
|---|---|
| **FIBO alignment: human clicks Accept/Reject on each candidate** (S8/S8b) | C3 AI, Impetus, Jedify: **Autonomous ontology management** — alignment is automatic above confidence threshold, human reviews only edge cases. Impetus: "Autonomous Ontology Management" — auto-generates OWL/RDF from schemas, maps to FIBO/HIPAA with <250ms latency. |
| **Document ingestion: manual upload → pipeline → SHACL gate → human resolves mentions** (S9) | Arango AutoGraph, Fluree CAM, Neo4j: **Autonomous graph construction** — drop documents in, the system discovers entities, relationships, and mentions without human intervention. Google Knowledge Catalog auto-tags and enriches PDFs on arrival. |
| **Glossary management: human curates definitions, reviews alignment** (S5/S6) | Jedify Semantic Fusion, BDB: **Autonomous semantic layer** — "Connect your data and knowledge sources. The system autonomously constructs a context graph. It learns your metrics, definitions, and relations directly from how your teams already operate." Zero manual curation for initial setup. |
| **Schema drift detection: manual "Regenerate" button** (Overview) | Neo4j, Jedify, Datobots: **Continuous drift detection and self-healing** — "If your database schema changes, the graph adapts. Your agents still understand what 'Monthly Active Users' means, even if the columns shift." No manual regeneration. |
| **Business rules: human writes JSON, human validates** (S6) | Aegis DQ, Amazon ADOP: **LLM-generated rules from policy docs** — "Point it at your policy docs and warehouse — it generates rules, validates your data, diagnoses every failure with LLM root-cause analysis, and proposes SQL fixes." Rules are generated, not hand-written. |
| **Query validation: human pastes SQL, clicks Validate** (S1) | Google Agent Platform, Kore.ai: **Embedded guardrails** — validation runs automatically on every agent-generated query. The human never sees a "Validate" button because the gate is inside the agent's execution pipeline. |
| **Knowledge graph visualization: human clicks through perspectives** (S11) | Google, Databricks, Neo4j: **Agent-native context** — agents query the graph directly. Human visualization is a debug tool, not a primary interface. |
| **Changes/Evaluations: human triggers "Run all"** (S12/S13) | Kore.ai Artemis, Google: **Continuous automated evaluation** — "Continuously evaluate prompt, model, and policy changes against golden datasets. Detect quality regressions before they reach production." No manual "Run" button. |

### The 5 Gaps That Matter Most

#### 1. Autonomy vs. Dashboard (Critical)
The prototype is a control panel for humans to operate a semantic layer. The 2026 standard is an autonomous system that needs a human only for exceptions. The prototype has 16 pages of manual UI; industry has agents that do the work with humans approving edge cases.

**Recommendation:** Flip the model — agents do the work automatically, the UI becomes a monitoring/exception-handling surface.

#### 2. MCP (Model Context Protocol) Integration (Critical)
Every major platform in 2026 supports MCP:
- Google: "MCP for Google Cloud — governing agent interactions based on IAM policies"
- Databricks: "Managed OAuth MCP Connectors"
- Neo4j: "Native MCP server"
- Impetus: "MCP-first serving layer, sub-250ms latency"
- Fluree: "Native MCP server"

The prototype has zero MCP support. This is the standard interface for agents to discover and use data assets. Without MCP, the system is isolated.

**Recommendation:** Add MCP server as a priority in v1 or v1.1.

#### 3. Continuous Evaluation (Critical)
Kore.ai Artemis: "100% of AI interactions audited" — not sampled, not on-demand.
Google: "Agent Evaluation continuously scores agents against live traffic using multi-turn autoraters."
Databricks: "CLEARS Framework — evaluate agents across correctness, latency, execution, adherence, relevance, and safety."

The prototype has manual "Run all on v14" button. No continuous evaluation. No regression detection.

**Recommendation:** Shift evaluations from on-demand to event-driven (triggered on context changes, not human clicks).

#### 4. Agent-to-Agent Orchestration (Important)
Google: "Agent-to-agent orchestration — enables agents to seamlessly delegate tasks to one another."
Kore.ai: "Agents run in parallel, each with a bounded context. One agent failing won't unwind everything."
Databricks: "Supervisor Agent (GA) — orchestrate multiple agents and tools into a single workflow."

The prototype has one agent, one conversation, no sub-agent delegation.

**Recommendation:** Add supervisor agent pattern to Agent Workspace (S10) or defer to v2.

#### 5. Provenance-as-a-Service (Important)
Impetus: "Every answer traceable to its source data."
Fluree: "Time-travel with cryptographic audit."
BDB: "Full Ontological Audit Trail — end-to-end traceability of every data interaction."

The prototype has provenance field missing from GlossaryEntry (acknowledged in S5 plan). No per-query audit trail.

**Recommendation:** Add provenance to GlossaryEntry and per-query run-log as priority.

### What the Prototype Gets Right (Keep These)

| Capability | Industry Alignment |
|---|---|
| Symbolic validation gate (`validate_sql`) | **Strong** — Kore.ai calls this "engine-enforced constraints, LLM can't override them." The regex-based validator is the right idea. |
| FIBO ontology alignment | **Unique advantage** — Most platforms don't have FIBO-specific alignment. Fluree mentions it as an option, not a default. |
| SHACL-gated document ingestion | **Good** — Graphwise uses SHACL validation too. The gate is well-designed. |
| Single semantic layer across SQL/Cypher/SPARQL | **Good** — BDB's "Kinetic Semantic Layer" does the same. Multi-query-surface is the right pattern. |
| Neural-seam architecture (LLM → symbolic gate → execution) | **Excellent** — This is exactly what Kore.ai's ABL compiles to. The seam is the right architecture. |

### Recommended Reframe for Remaining 10 Pages

| Current Pattern | Reframed Pattern |
|---|---|
| Human clicks "Validate" on every query | Agent runs all queries through the gate automatically; UI shows a **verdict feed** (already in prototype's Overview) |
| Human clicks Accept/Reject on each alignment | System auto-aligns above 0.90, queues only 0.50–0.89 for human review; UI shows a **review queue**, not a per-item workflow |
| Human clicks "Ingest document" | Document lands in a monitored folder → agent ingests automatically; UI shows **pipeline status** (already in prototype's Documents page) |
| Human clicks "Run all" on evaluations | Evaluations run on every context change; UI shows **comparison dashboard** (already in prototype's Evaluations page) |
| Human navigates 16 pages | **Command palette + sidebar with 4 primary views** — the rest are debug/audit surfaces |

### Strategic Decision Required

Three options for proceeding with the remaining 10 pages:

1. **Build as designed** — Continue with 10 remaining pages as prototype specifies. Fastest path to completing v1 as a human-operated tool. Accepts that it competes with established dashboard tools.

2. **Reframe remaining pages** — Collapse 10 pages into fewer surfaces, shift to agent-first model where UI becomes monitoring/exception surface. Changes story splits and plans significantly.

3. **Hybrid** — Build the 10 pages as designed but add autonomous layer underneath (auto-align FIBO above 0.90, auto-ingest documents, auto-run evaluations on context changes) so manual UI becomes optional rather than required.

---

## Agentic Enterprise UX Pattern Analysis (July 2026)

**Based on:** Palantir Foundry AIP, Kore.ai Artemis, C3 AI Studio, Google Gemini Agent Studio, Databricks Agent Bricks, Neo4j Bloom, Impetus Context Fabric, Microsoft Agent Control Plane, AWS Bedrock AgentCore governance patterns.

### Cross-Platform Screen Architecture Patterns

Every major platform converges on the same 4-panel structure for agent management. The pattern is not a dashboard — it's a **workbench with a control plane**.

#### Pattern 1: The Unified Workbench (C3 AI Studio, Palantir Foundry)
```
┌─────────────────────────────────────────────────────────┐
│ Top Bar: Context Switcher · Status Beacons · Help       │
├──────────┬──────────────────────────┬───────────────────┤
│ Sidebar  │  Primary Canvas          │  Inspector Panel  │
│          │  (Full-height)           │  (Contextual)     │
│ Nav      │                          │                   │
│ items    │  ┌──────────────────┐    │  Properties       │
│          │  │ Visual Builder / │    │  Actions          │
│ Agents   │  │ Graph / Table    │    │  Audit trail      │
│ Data     │  │ / Chat           │    │  Metrics          │
│ Ontology │  │                  │    │                   │
│ Rules    │  └──────────────────┘    │                   │
│ Monitor  │                          │                   │
│ Settings │  ┌──────────────────┐    │                   │
│          │  │ Console / Output │    │                   │
│          │  └──────────────────┘    │                   │
├──────────┴──────────────────────────┴───────────────────┤
│ Status Bar: Health · Cost · Latency · Version           │
└─────────────────────────────────────────────────────────┘
```
**Used by:** C3 AI Studio (data pipeline canvas + agent workbench), Palantir Foundry (Ontology SDK + Workshop + AIP Logic)
**Key insight:** The canvas is the primary surface. The sidebar is navigation, the inspector is context. Users don't "navigate pages" — they work on a canvas and the inspector changes.

#### Pattern 2: The Agent Builder with Preview (Google Agent Studio, Kore.ai Artemis)
```
┌─────────────────────────────────────────────────────────┐
│ Top Bar: Agent Selector · Deploy · Metrics              │
├──────────┬──────────────────────┬───────────────────────┤
│ Left     │  Center Canvas       │  Right Panel          │
│ Panel    │                      │                       │
│          │  Flow Tab:           │  Details Panel        │
│ Controls │  ┌──────────────┐    │  ┌─────────────────┐  │
│          │  │ Agent nodes  │    │  │ Model selector  │  │
│ Model    │  │ connected by │    │  │ Tools list      │  │
│ Tools    │  │ edges        │    │  │ Knowledge srcs  │  │
│ Knowledge│  └──────────────┘    │  │ Guardrails      │  │
│ Guardrails│                     │  │ Delegation rules│  │
│          │  Preview Tab:        │  └─────────────────┘  │
│          │  ┌──────────────┐    │                       │
│          │  │ Live chat    │    │  Trace Panel          │
│          │  │ with agent   │    │  ┌─────────────────┐  │
│          │  └──────────────┘    │  │ Reasoning steps │  │
│          │                      │  │ Tool calls      │  │
│          │  Code Tab:           │  │ Latency/cost    │  │
│          │  ┌──────────────┐    │  └─────────────────┘  │
│          │  │ ABL / YAML   │    │                       │
│          │  └──────────────┘    │                       │
├──────────┴──────────────────────┴───────────────────────┤
│ Status: Runtime · Last deploy · Health                   │
└─────────────────────────────────────────────────────────┘
```
**Used by:** Google Gemini Agent Studio (Flow/Preview/Code tabs), Kore.ai Artemis (Studio IDE with visual + code editing)
**Key insight:** Three views of the same agent: visual flow, live preview, and code. The right panel is always inspector/trace.

#### Pattern 3: The Governance Control Plane (Microsoft CAF, AWS AgentCore, Clyro)
```
┌─────────────────────────────────────────────────────────┐
│ Top Bar: Fleet Overview · Policy Status · Alerts        │
├──────────┬──────────────────────┬───────────────────────┤
│ Left     │  Center: Registry /  │  Right: Detail        │
│ Filter   │  Fleet View          │                       │
│          │                      │  Agent Info           │
│ By team  │  ┌──────────────┐    │  ┌─────────────────┐  │
│ By agent │  │ Agent cards  │    │  │ Identity        │  │
│ By policy│  │ or table     │    │  │ Policies        │  │
│ By status│  │              │    │  │ Audit log       │  │
│          │  └──────────────┘    │  │ Cost breakdown  │  │
│          │                      │  │ Drift alerts    │  │
│          │  Policy State:       │  └─────────────────┘  │
│          │  ┌──────────────┐    │                       │
│          │  │ Drift matrix │    │                       │
│          │  └──────────────┘    │                       │
├──────────┴──────────────────────┴───────────────────────┤
│ Status: Total agents · Active policies · Drift count    │
└─────────────────────────────────────────────────────────┘
```
**Used by:** Microsoft Agent 365 (agent registry + policy matrix), AWS Bedrock governance (agent registry + tool catalog)
**Key insight:** The "fleet view" is a table or card grid of all agents, not individual pages per agent. Policy state is a matrix (agent × policy), not a per-agent configuration.

#### Pattern 4: The Observability Dashboard (Kore.ai Artemis, Google Agent Engine)
```
┌─────────────────────────────────────────────────────────┐
│ Top Bar: Time Range · Agent Filter · Export              │
├──────────┬──────────────────────────────────────────────┤
│ Tabs:    │  Metrics Grid                                │
│ Overview │  ┌────────┐ ┌────────┐ ┌────────┐ ┌───────┐ │
│ Traces   │  │Tokens  │ │Latency │ │Errors  │ │Cost   │ │
│ Evals    │  │ 1.2M   │ │ p95    │ │ 0.3%   │ │ $4.2K │ │
│ Quality  │  └────────┘ └────────┘ └────────┘ └───────┘ │
│ ROI      │                                              │
│          │  Charts:                                      │
│          │  ┌──────────────────────────────────────────┐│
│          │  │ Time series: tokens/cost/errors over time││
│          │  └──────────────────────────────────────────┘│
│          │                                              │
│          │  Traces Tab:                                 │
│          │  ┌──────────────────────────────────────────┐│
│          │  │ Session list → Trace detail → Timeline   ││
│          │  └──────────────────────────────────────────┘│
│          │                                              │
│          │  Evals Tab:                                  │
│          │  ┌──────────────────────────────────────────┐│
│          │  │ Case table → v13 vs v14 comparison       ││
│          │  └──────────────────────────────────────────┘│
├──────────┴──────────────────────────────────────────────┤
│ Status: Uptime · Current QPS · Active sessions          │
└─────────────────────────────────────────────────────────┘
```
**Used by:** Kore.ai Artemis (Agent Insights dashboards), Google Agent Engine (metrics/traces/playground)
**Key insight:** The observability surface is separate from the builder surface. Users switch between "build" mode and "observe" mode. The trace detail is the most-used debug tool.

---

## Polanyi Studio v2: Proposed Screen Architecture

Based on the cross-platform analysis, the Polanyi prototype should collapse from 16 pages to **4 primary views + 2 overlay surfaces**. The agent-first model means the UI is a monitoring/exception-handling surface, not a control panel.

### Navigation Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Top Bar                                                  │
│ ┌─────────┐ ┌──────────────────┐ ┌──────┐ ┌──────────┐ │
│ │ Logo    │ │ Context Switcher │ │ Beacons│ │ Cmd+K  │ │
│ │ Polanyi │ │ demo.db v14     │ │ ●●●●  │ │ Search  │ │
│ └─────────┘ └──────────────────┘ └──────┘ └──────────┘ │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  4 PRIMARY VIEWS (sidebar navigation):                   │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ 1. HOME  │  │ 2. BUILD │  │ 3. GOVERN│  │ 4.MORE │ │
│  │ (Overview│  │ (Agent + │  │ (Ontology│  │ (Graph │ │
│  │ + Monitor│  │  Context)│  │  + Rules │  │  Docs, │ │
│  │  + Evals)│  │          │  │  + Valid.)│  │  Settings│
│  └──────────┘  └──────────┘  └──────────┘  └────────┘ │
│                                                          │
│  2 OVERLAY SURFACES (triggered by context):              │
│  • Command Palette (Cmd+K): search, jump, execute        │
│  • Agent Chat: side-panel conversation with agent        │
│                                                          │
├─────────────────────────────────────────────────────────┤
│ Status Bar: Health · Latency · Cost · Version · Drift   │
└─────────────────────────────────────────────────────────┘
```

### View 1: HOME — The Control Plane

**Purpose:** Fleet-level awareness. What's happening right now, what needs attention, what changed.

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ HOME                                                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────┬─────────────┬─────────────┬──────────┐ │
│  │ Health Card │ Latency     │ Cost Today  │ Drift    │ │
│  │ ● Healthy   │ p50: 120ms  │ $4.23       │ 0 alerts │ │
│  │             │ p95: 340ms  │             │          │ │
│  └─────────────┴─────────────┴─────────────┴──────────┘ │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ VERDICT FEED (auto-scrolling, last 20)           │   │
│  │                                                    │   │
│  │ 14:32  SELECT * FROM trades   ✅ PASS  (0.8s)    │   │
│  │ 14:31  MATCH (n:Counterparty) ✅ PASS  (0.2s)    │   │
│  │ 14:30  SELECT * FROM orders   ⚠️ WARN  (1.1s)   │   │
│  │   └─ Rule R007: date range > 365d                │   │
│  │ 14:28  SELECT count(*) FROM… ❌ FAIL  (0.3s)    │   │
│  │   └─ Rule R001: missing WHERE clause             │   │
│  │   └─ [View] [Re-validate] [Ask Agent]            │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────┬───────────────────────────┐   │
│  │ COVERAGE METERS      │ RECENT CHANGES             │   │
│  │                       │                            │   │
│  │ Sources:    4/4  ████ │ v14: Auto-aligned 23 terms │   │
│  │ Glossary:  87%  ███░ │ v14: 2 rules generated     │   │
│  │ Rules:     12   ████ │ v14: SHACL passed 3/3 docs │   │
│  │ FIBO:      71%  ██░░ │                             │   │
│  │ Documents:  5   ████ │ [View all changes →]        │   │
│  └──────────────────────┴───────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ KNOWLEDGE GAPS (auto-detected)                    │   │
│  │                                                    │   │
│  │ ⚠ 3 tables have no glossary term mapped           │   │
│  │ ⚠ 2 rules reference deleted columns              │   │
│  │ ⚠ 1 FIBO alignment confidence dropped below 0.85 │   │
│  │                                                    │   │
│  │ [Auto-fix] [Review each] [Dismiss]                │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Key behavior:**
- The verdict feed is **auto-populated** — every query that passes through the neural seam logs here automatically. No "Run" button.
- Knowledge gaps are **auto-detected** by a background agent that monitors schema drift, rule staleness, and alignment decay.
- Coverage meters read from `/api/sources`, `/api/context`, `/api/rules`, `/api/context/align`.
- The "Ask Agent" link on a failed verdict opens the Agent Chat overlay pre-loaded with that query's context.

### View 2: BUILD — Agent + Context

**Purpose:** Where you configure what the agent knows and how it reasons. This is the "authoring" surface.

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ BUILD                                                    │
├──────────┬──────────────────────────┬───────────────────┤
│ Tabs:    │  Primary Canvas          │  Inspector        │
│          │                          │                   │
│ Agent    │  ┌──────────────────┐    │  [Context tab]    │
│ Context  │  │ Agent Config:    │    │  ┌─────────────┐  │
│ Glossary │  │                  │    │  │ Glossary    │  │
│ Rules    │  │ Model: claude-3  │    │  │ 87 terms    │  │
│ Sources  │  │ Temp: 0.3        │    │  │ 23 need     │  │
│          │  │                  │    │  │ review      │  │
│          │  │ Tools:           │    │  │ [Auto-align]│  │
│          │  │ ├─ validate_sql  │    │  └─────────────┘  │
│          │  │ ├─ run_cypher    │    │                   │
│          │  │ ├─ sparql_query  │    │  [Rules tab]      │
│          │  │ └─ search_glossary│   │  ┌─────────────┐  │
│          │  │                  │    │  │ 12 rules    │  │
│          │  │ Knowledge:       │    │  │ 3 generated │  │
│          │  │ ├─ context_v14   │    │  │ [Auto-gen]  │  │
│          │  │ └─ fibo_subset   │    │  └─────────────┘  │
│          │  │                  │    │                   │
│          │  │ Guardrails:      │    │  [Sources tab]    │
│          │  │ ├─ SHACL gate ✓  │    │  ┌─────────────┐  │
│          │  │ ├─ SQL validator │    │  │ 4 sources   │  │
│          │  │ └─ max_tokens    │    │  │ Schema ✓    │  │
│          │  └──────────────────┘    │  │ Drift: none │  │
│          │                          │  └─────────────┘  │
│          │  ┌──────────────────┐    │                   │
│          │  │ PREVIEW (chat)   │    │  [Audit tab]      │
│          │  │                  │    │  ┌─────────────┐  │
│          │  │ > Show me all    │    │  │ Last 5 runs │  │
│          │  │   counterparty   │    │  │ Latency p95 │  │
│          │  │   trades in 2024 │    │  │ Cost today  │  │
│          │  │                  │    │  └─────────────┘  │
│          │  │ [Agent response] │    │                   │
│          │  │                  │    │                   │
│          │  │ ┌──────────────┐ │    │                   │
│          │  │ │ Reasoning:   │ │    │                   │
│          │  │ │ 1. Parse     │ │    │                   │
│          │  │ │ 2. Validate  │ │    │                   │
│          │  │ │ 3. Execute   │ │    │                   │
│          │  │ └──────────────┘ │    │                   │
│          │  └──────────────────┘    │                   │
├──────────┴──────────────────────────┴───────────────────┤
│ Context: v14 · Last generated: 2 hours ago · [Regenerate]│
└─────────────────────────────────────────────────────────┘
```

**Key behavior:**
- The Agent Config panel is a **form**, not a code editor. Users set model, temperature, tools, knowledge sources via controls.
- The Preview panel is a **live chat** with the agent. Every test query automatically goes through the neural seam. The reasoning trace shows below the response.
- The Inspector panel has 4 tabs: Context (glossary + alignment queue), Rules (generated + manual), Sources (schema + drift), Audit (recent runs + cost).
- The "Auto-align" button runs FIBO alignment in the background. Results appear in a review queue (items below 0.90 confidence require human approval).
- The "Auto-gen" button for rules scans schema + glossary and suggests rules. High-confidence rules are auto-added; low-confidence ones go to review queue.

### View 3: GOVERN — Ontology + Validation + Rules

**Purpose:** Where you ensure compliance. The governance surface is about exception handling, not routine operations.

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ GOVERN                                                   │
├──────────┬──────────────────────────┬───────────────────┤
│ Tabs:    │  Primary Canvas          │  Inspector        │
│          │                          │                   │
│ Ontology │  [Ontology tab selected] │  [Alignment       │
│ FIBO     │                          │   Queue]          │
│ Rules    │  ┌──────────────────┐    │  ┌─────────────┐  │
│ Validate │  │ FIBO Alignment   │    │  │ NEED REVIEW │  │
│ Audit    │  │ Matrix           │    │  │             │  │
│          │  │                  │    │  │ "revenue" → │  │
│          │  │ Entity │ FIBO   │    │  │ FIBO:Revenue│  │
│          │  │ ───────┼────────│    │  │ conf: 0.78  │  │
│          │  │ Trade  │ ✅ 0.95│    │  │ [Accept]    │  │
│          │  │ Party  │ ✅ 0.92│    │  │ [Reject]    │  │
│          │  │ Order  │ ⚠ 0.81│    │  │ [Edit]      │  │
│          │  │ Amount │ ✅ 0.91│    │  │             │  │
│          │  │ Date   │ ❌ 0.45│    │  │ "notional"→ │  │
│          │  │                  │    │  │ FIBO:Amount │  │
│          │  │ [Auto-align     ]│    │  │ conf: 0.62  │  │
│          │  │ [Export OWL     ]│    │  │ [Accept]    │  │
│          │  └──────────────────┘    │  │ [Reject]    │  │
│          │                          │  └─────────────┘  │
│          │  ┌──────────────────┐    │                   │
│          │  │ Validation       │    │  [AUTO-ALIGNED]   │
│          │  │ Results          │    │  ┌─────────────┐  │
│          │  │                  │    │  │ 23 items    │  │
│          │  │ Last 50 queries: │    │  │ conf > 0.90 │  │
│          │  │ ✅ 42  ⚠️ 5  ❌ 3│    │  │ Auto-added  │  │
│          │  │                  │    │  └─────────────┘  │
│          │  │ By rule:         │    │                   │
│          │  │ R001: ✅ 98%     │    │  [RULES]         │
│          │  │ R007: ⚠️ 85%     │    │  ┌─────────────┐  │
│          │  │ R012: ❌ 72%     │    │  │ 12 rules    │  │
│          │  │                  │    │  │ 3 auto-gen  │  │
│          │  │ [Export report]  │    │  │ [Generate]  │  │
│          │  └──────────────────┘    │  └─────────────┘  │
├──────────┴──────────────────────────┴───────────────────┤
│ Governance: 71% FIBO coverage · 12 rules · 0 violations │
└─────────────────────────────────────────────────────────┘
```

**Key behavior:**
- The FIBO alignment matrix is the primary view. It shows every entity, its FIBO mapping, and confidence score.
- Items with confidence 0.50–0.89 appear in the "NEED REVIEW" queue on the right. Items above 0.90 are auto-aligned. Items below 0.50 are flagged as unmapped.
- The Validation Results panel is **auto-populated** from the verdict feed. No "Run" button — every query through the agent is logged here.
- The "Auto-align" button triggers a background job that re-runs FIBO alignment. New candidates appear in the review queue.
- The "Export OWL" button generates an OWL/RDF file of the current ontology.

### View 4: MORE — Graph, Documents, Settings, Activity

**Purpose:** Secondary surfaces. These are debug/audit tools, not primary workflows.

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ MORE                                                     │
├──────────┬──────────────────────────┬───────────────────┤
│ Tabs:    │  Primary Canvas          │  Inspector        │
│          │                          │                   │
│ Graph    │  [Graph tab selected]    │  [Node Detail]    │
│ Docs     │                          │  ┌─────────────┐  │
│ Activity │  ┌──────────────────┐    │  │ Label:Trade │  │
│ Insights │  │ Knowledge Graph  │    │  │ Properties: │  │
│ Settings │  │ (NVL Canvas)     │    │  │ id: T-001   │  │
│ Registry │  │                  │    │  │ date: 2024  │  │
│          │  │  (●)──(●)──(●)  │    │  │ amount: $5M │  │
│          │  │  │    │    │    │    │  │ party: Acme  │  │
│          │  │  (●)──(●)      │    │  │ [Edit]       │  │
│          │  │                  │    │  │ [Delete]     │  │
│          │  │ Perspective:     │    │  │ [Trace]      │  │
│          │  │ [Compliance]     │    │  └─────────────┘  │
│          │  │ [Lineage]        │    │                   │
│          │  │ [Risk]           │    │  [Connected       │  │
│          │  │ [Temporal]       │    │   Nodes]          │  │
│          │  │ [Full]           │    │  ┌─────────────┐  │
│          │  │                  │    │  │ Counterparty│  │
│          │  │ Search:          │    │  │ Order       │  │
│          │  │ [________________]│   │  │ Settlement  │  │
│          │  └──────────────────┘    │  └─────────────┘  │
│          │                          │                   │
│          │  ┌──────────────────┐    │  [Cypher Console] │
│          │  │ Documents List   │    │  ┌─────────────┐  │
│          │  │                  │    │  │ MATCH (n)   │  │
│          │  │ 📄 ISDA_Master   │    │  │ RETURN n    │  │
│          │  │    SHACL: ✅     │    │  │ LIMIT 25    │  │
│          │  │    Mentions: 12  │    │  │ [Execute]   │  │
│          │  │ 📄 Trade_Confirm │    │  └─────────────┘  │
│          │  │    SHACL: ⚠️     │    │                   │
│          │  │    Mentions: 8   │    │                   │
│          │  └──────────────────┘    │                   │
├──────────┴──────────────────────────┴───────────────────┤
│ Graph: 1,247 nodes · 3,891 edges · Last materialized: 1h│
└─────────────────────────────────────────────────────────┘
```

**Key behavior:**
- The Graph tab uses NVL (Neo4j Visualization Library) for interactive graph exploration. Perspective selector (5 tabs) filters the view.
- The Documents tab shows a list of ingested documents with SHACL status and mention counts. Clicking a document opens a detail view with highlighted terms.
- The Activity tab shows a chronological log of all system events (alignments, validations, ingestions, agent runs).
- The Settings tab shows backend health, LLM config, and service status.
- The Registry tab shows capabilities, skills, connectors, and prompts (read-only).

### Overlay Surfaces

#### Command Palette (Cmd+K)
```
┌─────────────────────────────────────┐
│ 🔍 Search pages, terms, rules...    │
├─────────────────────────────────────┤
│ Pages                               │
│   → Home                            │
│   → Build                           │
│   → Govern                          │
│   → Graph                           │
│                                     │
│ Terms                               │
│   → "revenue" (FIBO:Revenue)        │
│   → "counterparty" (FIBO:Party)     │
│                                     │
│ Rules                               │
│   → R001: No full-table scans       │
│   → R007: Date range validation     │
│                                     │
│ Actions                             │
│   → Regenerate context              │
│   → Run FIBO alignment              │
│   → Export OWL                      │
│   → Validate last query             │
└─────────────────────────────────────┘
```

#### Agent Chat (Side Panel)
```
┌─────────────────────────────┐
│ Agent Chat            [×]   │
├─────────────────────────────┤
│                             │
│ > Show me all trades with   │
│   counterparty risk > 0.8   │
│                             │
│ [Agent reasoning...]        │
│ 1. Parsed intent            │
│ 2. Mapped to schema:        │
│    trades, counterparties   │
│ 3. Applied rules:           │
│    R007 (date range)        │
│ 4. Generated SQL:           │
│    SELECT t.*, c.risk_score │
│    FROM trades t            │
│    JOIN counterparties c    │
│    ON t.party_id = c.id     │
│    WHERE c.risk_score > 0.8 │
│    AND t.date > '2024-01-01'│
│ 5. Validated: ✅ PASS       │
│ 6. Executed: 47 rows        │
│                             │
│ [Show results] [Export]     │
│ [Ask follow-up]             │
│                             │
├─────────────────────────────┤
│ [Type a message...]    [→]  │
└─────────────────────────────┘
```

### Component Reuse Map

| Current Prototype Component | Maps to v2 View | Change Required |
|---|---|---|
| Overview page | HOME view | Becomes auto-populated verdict feed + health cards + knowledge gaps |
| Sources page | BUILD → Sources tab | Becomes inspector panel content, not a standalone page |
| Model (Glossary) page | BUILD → Context tab | Becomes inspector panel with alignment queue |
| Documents page | MORE → Docs tab | Becomes list + detail in secondary surface |
| Rules page | BUILD → Rules tab + GOVERN → Rules | Split: rules config in Build, rules enforcement in Govern |
| Validator page | GOVERN → Validate tab | Becomes auto-populated from verdict feed, no manual trigger |
| Agent Workspace | BUILD → Preview panel + Agent Chat overlay | Split: config in Build, conversation in overlay |
| Knowledge Graph | MORE → Graph tab | Becomes NVL canvas in secondary surface |
| Query Console | BUILD → Preview + MORE → Cypher Console | Split: agent chat in Build, raw console in More |
| Changes page | HOME → Recent Changes card + GOVERN → Audit | Collapsed to cards, not a full page |
| Evaluations page | HOME → Metrics + MORE → Activity | Collapsed to metrics grid and activity log |
| Insights page | MORE → Insights tab | Remains secondary, experimental |
| Activity page | MORE → Activity tab | Becomes chronological event log |
| Capabilities/Registry | MORE → Registry tab | Becomes read-only registry in secondary surface |
| Settings page | MORE → Settings tab | Becomes health/config in secondary surface |

### Effort Estimate for v2 Reframe

| Work Item | Effort | Blocks |
|---|---|---|
| App shell restructure (4 views + overlays) | 3-4 days | All views |
| HOME view (verdict feed + health + gaps) | 2-3 days | Core monitoring surface |
| BUILD view (agent config + context inspector + preview) | 3-4 days | Authoring surface |
| GOVERN view (alignment matrix + validation + rules) | 2-3 days | Governance surface |
| MORE view (graph + docs + settings) | 2-3 days | Secondary surfaces |
| Command palette | 1 day | Navigation |
| Agent chat overlay | 1-2 days | Agent interaction |
| Backend: auto-alignment + auto-validation hooks | 2-3 days | Autonomous behavior |
| Backend: verdict feed endpoint + knowledge gap detection | 2-3 days | HOME view data |
| Backend: context change triggers eval | 1-2 days | Continuous evaluation |

**Total:** ~20-27 days (4-5.5 weeks)

**vs. Building all 10 pages as designed:** ~28-42 days (6-8.5 weeks)

**The v2 reframe is faster** because it collapses redundant pages and eliminates manual workflows that need no backend support.
