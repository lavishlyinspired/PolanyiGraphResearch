# Polanyi Works Studio — UI Specification & Implementation Plan

**Status:** Proposal (v3 — audited and consolidated. A separate session had expanded the sidebar to 21 items including a 5-page "Intelligence" group backed by `packages/gnn-runtime`, a disconnected research spike with no API wiring, no tests, and no entry in the root `pyproject.toml`. That group is consolidated into one honestly-labeled "Graph Insights" page (nested under Knowledge Graph, badged **experimental**); a speculative "Practices" page with zero backend was removed entirely. See [`polanyi-studio-prototype-additions.md`](polanyi-studio-prototype-additions.md) for the full audit and the research parking lot it now serves as.) · **Prototype:** [`polanyi-studio-prototype.html`](polanyi-studio-prototype.html) — a self-contained HTML file, 16 pages, all cross-wired (nav ↔ views ↔ command palette ↔ keyboard shortcuts verified). Every screen described here exists in the prototype.
**Relationship to the current `apps/studio`:** none. This is a clean-slate design; the existing studio is deliberately ignored per the design brief. `PRODUCT.md` (repo root) captures the strategic register this spec follows.

---

## 1. The design thesis

Polanyi Works' differentiator is not "another data catalog" and not "another chat-with-your-data app." It is the **visible contract between neural and symbolic**: the LLM reasons, the symbolic layer decides. The UI's job is to make that contract inspectable everywhere:

1. **Provenance is the interface.** Every fact carries a badge for how it was derived:
   - `⬢ Schema` (moss green) — deterministic, derived from metadata/FKs. Always present, never degraded.
   - `✦ LLM-enriched` (violet) — model-drafted, reviewable, never authoritative for enforcement.
   - `§ Declared / Curated` (neutral ink) — human-authored, authoritative (business rules, curated definitions).
2. **Verdicts are stamps in a ledger.** `✓ PASS` / `✕ BLOCKED BR-001` are first-class visual objects (mono, bordered, tinted), used identically in the validator, the agent trace, the overview feed, and rule detail. A blocked query is a *feature being demonstrated*, never an error state to hide.
3. **The ledger, not the dashboard.** Dense tables, activity feeds and coverage meters instead of KPI hero tiles. The audience is expert data-platform engineers; density is respect.
4. **LLM-optional must be visible.** Every surface states what still works without a model key (validator: "no model involved"; sources: "deterministic engine always runs"; settings: explicit degradation note).

Pattern research grounding (what the category's best tools do, adapted):
- Data-catalog patterns — asset tables with governance chips, coverage metrics, glossary-first IA — from the [Atlan / data-catalog space](https://atlan.com/data-catalog-tools/) and [semantic-layer tooling](https://atlan.com/know/best-semantic-layer-tools/); treat the semantic layer "as code with owners and reviews," per [Databricks' semantic-layer architecture guidance](https://www.databricks.com/blog/semantic-layer-architecture-components-design-patterns-and-ai-integration).
- Agent-trace patterns — full execution tree (LLM call → tool call → verdict), threads/sessions as first-class — from [LangSmith observability](https://www.langchain.com/langsmith/observability) and [Langfuse agent tracing](https://langfuse.com/blog/2024-07-ai-agent-observability-with-langfuse). Our twist: the trace's hero moment is the *symbolic block + self-correction*, which observability tools don't have.
- Product-register conventions (sidebar + top bar + ⌘K command palette, inspector drawers, dense tables, skeleton loading) as practiced by Linear/Stripe-class product UIs.

## 2. Information architecture

Sidebar navigation, grouped by the user's workflow (not by backend):

| Group | Page | Job to be done |
|---|---|---|
| — | **Overview** | "Is my semantic runtime healthy and current?" Pipeline rail, drift alert, verdict ledger, coverage, backend health |
| Ground | **Data Sources** | Connect URIs, introspect schemas, trigger context generation |
| Ground | **Semantic Model** | Curate glossary (SKOS), inspect entities/relationships; publish RDF |
| Ground | **Documents** | Ingest unstructured sources, review mentions, resolve to terms |
| Govern | **Business Rules** | Declare/inspect rules, see enforcement history |
| Govern | **Ontology · FIBO** | Alignment queue (auto / review / rejected), FIBO search, OWL reasoning |
| Govern | **Validator** | Ad-hoc SQL validation playground — the gate, demonstrable |
| Govern | **Changes** *(v2)* | Context versions, semantic diff, steward review queue, audit ledger |
| Operate | **Agent Workspace** | Ask grounded questions; audit the reasoning trace; feedback → eval cases |
| Operate | **Evaluations** *(v2)* | Golden-question suites; version-vs-version comparison; CI gate |
| Operate | **Knowledge Graph** | Explore the Neo4j projection; guarded Cypher console |
| Operate | **Query Console** *(v2)* | SPARQL / Cypher / SQL workbench — same stores, same guards as the agent |
| Operate | **Activity** *(v2)* | Unified run/job ledger with duration, tokens, cost; job logs |
| Platform | **Registry & Extensions** *(v2, reworked)* | Capabilities, skills, agents & workflows, connectors, prompt registry |
| Platform | **Settings** | LLM providers, backends, env (`POLANYI_*`) |

Global chrome addition *(v2)*: a **notification tray** (topbar flag icon) for the three standing alert classes — schema drift, SHACL-held documents, pending steward reviews — each deep-linking to its surface.

Global chrome:
- **Top bar:** context switcher (`demo.db · financial-demo v14`) — the whole app is scoped to one semantic context at a time; backend beacons (GraphDB / Neo4j / LLM) with live status dots; `⌘K` command palette (pages, terms, rules, capabilities).
- **Right inspector drawer** (390 px) for record detail (glossary term, rule, graph node) — never modals for read-mostly detail.
- **Deep links:** every page is a hash/route; every term/rule/session addressable by URL.

## 3. Design system

### 3.1 Color (light theme, deliberate)

Scene: an engineer at a desk in office daylight auditing what an AI did — a reading-and-trust context. Light theme is the committed default; dark mode is a Phase-4 item done properly (own ramp, not inversion), not a launch blocker.

| Token | Value | Role |
|---|---|---|
| `--bg` | `#ffffff` | canvas (pure white, no hidden warmth) |
| `--panel` / `--side` | `#f6f7f3` / `#f3f5ee` | second neutral layer (green-tinted) for panels/sidebar |
| `--line` / `--line-2` | `#e5e8de` / `#cdd2c4` | hairlines / strong borders |
| `--ink` / `--ink-2` / `--ink-3` | `#1d211a` / `#454c3d` / `#6c7362` | text ramp (all ≥ 4.5:1 on white) |
| `--moss` / `--moss-deep` / `--moss-tint` | `#3e5226` / `#32421e` / `#edf1e3` | **brand primary = the symbolic/deterministic color.** Buttons, selection, `⬢ Schema` provenance |
| `--neural` / `--neural-text` / `--neural-tint` | `#5b4fc7` / `#443aa6` / `#edebfa` | **the neural color.** `✦ LLM` provenance, LLM trace steps. Never used for actions |
| `--good` / `--bad` / `--warn` (+tints) | `#1e7a4a` / `#a83226` / `#8a6116` | verdict/status. Always paired with icon + label, never color alone |
| `--doc` | `#2276b5` | document/skill affordances |
| Graph categorical | `#557f26` `#5b4fc7` `#2276b5` `#b07818` | Entity / Term / Document / Mention node colors — **CVD-validated** (dataviz six-checks: all pass, worst adjacent ΔE 20.5 deutan) |
| Chart pair | `#7e9155` passed / `#a83226` blocked | stacked verdict bars; identity also encoded by position (blocked anchored to baseline) + legend |

The moss/violet pairing *is* the product narrative in color: symbolic decides (moss = ink, actions, authority), neural proposes (violet = always a chip, a step, a suggestion — never a button).

### 3.2 Typography

- **Prototype:** system stack (`-apple-system, Segoe UI, system-ui`) + `ui-monospace` — zero-dependency.
- **Implementation:** IBM Plex Sans + IBM Plex Mono (self-hosted). One family each for UI and code; no display face. Fixed rem scale, ratio ≈ 1.2: 11 (uppercase labels) / 12 (mono, meta) / 13 (body) / 15 (drawer titles) / 18 (page titles).
- Mono is semantic, not decorative: identifiers, SQL/Cypher/SPARQL, IRIs, predicates, verdict stamps, env vars.

### 3.3 Component inventory (all present in the prototype)

| Component | Notes |
|---|---|
| `chip` (+ moss/neural/good/bad/warn/doc variants) | provenance, status, grounding citations |
| `stamp` | verdict: mono, 1.5 px border, tint. `✓ PASS` / `✕ BLOCKED BR-001` / `! BR-003` |
| `panel` + `panel-h` | bordered surface, 8 px radius, no shadows |
| `tbl` | dense data table; uppercase 11 px headers; `tabular-nums` for numerics; row-link hover |
| `ledgeritem` | time + mono query + stamp — the verdict feed |
| `meter` | coverage bars (label / value / 5 px track) |
| `pipeline` / `stage` | the Overview runtime rail |
| `docflow` | per-document pipeline chips (parse → extract → resolve → SHACL → publish) |
| `trace` / `step` | numbered timeline with typed pins: neutral (runtime), violet ring (LLM), gray ring (tool), solid green/red (verdicts); `<details>` for SQL bodies |
| `drawer` | right inspector, 200 ms ease-out slide |
| `seg` | segmented control (validator cases) |
| `cmdk` | native `<dialog>` command palette |
| `callout` | authority note (moss) / drift warning (amber) |
| `beacon` | backend status pill in top bar |

### 3.4 Interaction, motion, accessibility

- Motion: 150–250 ms, ease-out only; view transitions fade+4 px rise; drawer slide; **no page-load choreography**. Full `prefers-reduced-motion` fallback.
- Every interactive component needs default/hover/focus/active/disabled/loading states (prototype shows default/hover/focus; implementation adds the rest).
- Loading = skeleton rows in tables, never centered spinners. Empty states teach ("No rules yet — declare rules as JSON; predicates become both agent guidance and validation checks").
- WCAG 2.2 AA: text ≥ 4.5:1 (ink ramp verified), status never color-alone (icon + label + position), visible `:focus-visible` rings, full keyboard nav (⌘K, Esc, row-links as buttons), z-index scale (topbar 20 / drawer 30 / dialog 50 / toast 60).

## 4. Screen-by-screen spec with API mapping

Existing API surface referenced below is already live in `polanyi.api` unless marked *(new)*.

### 4.1 Overview
- **Data:** context meta + drift *(new: `GET /api/context/status` — version, generated_at, source, llm_used, drift[])*; verdict feed *(new: `GET /api/validations?limit=50` — requires persisting validator outcomes)*; coverage computed from `GET /api/context`; backend health *(new: `GET /api/health/backends`)*.
- **States:** no context yet → onboarding empty state ("Connect a source → Generate context" as the pipeline rail with stages grayed); no LLM key → LLM beacon shows `deterministic mode`, agent stage shows `/api/ask disabled`.

### 4.2 Data Sources
- **Data:** connections list *(new: persisted connection registry; today the CLI passes `--db` per invocation)*; schema via `DiscoverMetadata`; generate via existing generate pipeline *(new: `POST /api/context/generate` async job + progress)*.
- **Key interactions:** re-introspect, column→term mapping chips (link into glossary), drift highlighting on unmapped new columns.

### 4.3 Semantic Model
- **Data:** `GET /api/context` (terms, entities, relationships); publish via `POST /api/rdf/publish` (SHACL result surfaced verbatim on failure).
- **Glossary table columns:** term + altLabels, definition, provenance chip, FIBO status, governing rules. Term drawer = full SKOS record + mappings + related + documents + RDF identity (`https://polanyi.dev/term/…`, graph `urn:polanyi:context`).
- **Edit flows:** definition edit (marks provenance `§ Curated`), altLabel add *(new: `PATCH /api/context/terms/{id}`)*.

### 4.4 Business Rules
- **Data:** rules from context; enforcement counts/history *(new: same store as 4.1 validations)*.
- **Fixed banner:** "Declared rules are authoritative — the LLM can rephrase prose, never weaken the predicate" (this encodes the `test_llm_rewritten_rules_never_weaken_enforcement` guarantee as UX).

### 4.5 Ontology · FIBO
- **Data:** `GET /api/ontology/search`, `POST /api/context/align`, `GET /api/ontology/reason`.
- **Three queues:** auto (≥ 0.90, published as `skos:exactMatch`), review (0.50–0.89, LLM-ranked with accept/reject — writes back as curated alignment), rejected (with reason, e.g. the "Revenue → revenue bond" prefix-match case). Reasoning panel: ancestors walk always; HermiT chip reflects Java availability.

### 4.6 Documents
- **Data:** `POST /api/documents/ingest`; doc list + mention detail *(new: `GET /api/documents`, `GET /api/documents/{id}`)*.
- **Signature element:** the excerpt with `<mark>` mentions (violet = resolved, amber = unresolved with "Add as glossary term" affordance); SHACL-held documents show the violation and a re-run action.

### 4.7 Business-critical: Validator
- **Data:** `POST /api/validate` *(new thin wrapper over `validate_sql`)* returning per-rule verdicts.
- Two-panel: SQL editor left, rule-by-rule verdict ledger right. Badge: "deterministic verdict — no model involved." CLI equivalence line for trust (`polanyi validate "…"`).

### 4.8 Agent Workspace (hero surface)
- **Data:** `POST /api/ask` with `session_id`; trace from `AskResult.steps`; sessions list *(new: `GET /api/sessions` from the memory-runtime checkpoints)*.
- **Layout:** sessions (180 px) / chat / trace rail (350 px). Answer messages carry: grounding chip (context version, term/rule counts), result table, "N queries blocked → self-corrected" chip that scroll-highlights the trace step.
- **Trace grammar:** step pin encodes actor (runtime / ✦ LLM / tool / verdict). Blocked steps render the returned rule text in a red echo box — the neurosymbolic loop made visible. SQL bodies collapsed by default.
- **Streaming:** steps append live (SSE/WebSocket *(new)*); completed trace persists with the session.

### 4.9 Knowledge Graph
- **Data:** *(new: `GET /api/graph/neighborhood?focus=…&hops=2`)* over the Neo4j projection; `POST /api/graph/materialize`; guarded read-only Cypher via `RunCypher`.
- Canvas + legend (validated 4-color node palette) + inspector + Cypher console with result table. Node click → inspector; double-click → refocus neighborhood.

### 4.10 Capabilities · 4.11 Settings
- `GET /api/capabilities` renders the registry verbatim (kind chips: function/tool/skill/mcp; guard chips on ExecuteSQL/RunCypher). Skills panel shows `skill.yaml` + trust note. Settings mirrors `.env.example` (`POLANYI_*`), always stating the no-key degradation path.

## 5. Implementation plan (PR-sized, vertical slices)

Stack: keep **React + Vite + TypeScript (strict)** in `apps/studio`; add **TanStack Query** (server state), **CSS custom properties** for the token sheet above (no Tailwind needed — the system is small and bespoke); router with URL-addressable everything; **Vitest Browser Mode + Testing Library** per repo testing standards (TDD non-negotiable). Graph canvas: start with a thin SVG/`d3-force` layer (as prototyped) — adopt Neo4j NVL only if interaction depth demands it. No chart library (the one chart is a CSS stacked bar).

Each slice ships UI + API + tests end-to-end:

1. **Shell + tokens + Validator** — app chrome (sidebar/topbar/⌘K), design tokens, and the smallest end-to-end proof: `POST /api/validate` + the validator page. Establishes chips/stamps/panels/tables.
2. **Semantic Model read path** — glossary table + term drawer from `GET /api/context`; provenance chips throughout.
3. **Agent Workspace** — chat + trace rail on existing `/api/ask` (`AskResult.steps`), sessions read; the blocked→self-correct rendering.
4. **Overview** — needs the validation-outcome store + health/status endpoints; pipeline rail + verdict ledger + coverage.
5. **Business Rules** — rules pages + enforcement history (reuses the store from 4).
6. **Ontology** — alignment queues with accept/reject write-back; reasoning panel.
7. **Data Sources** — connection registry + schema browser + async generate with progress; drift surfacing.
8. **Documents** — list/detail with mention marks; SHACL-held flow.
9. **Knowledge Graph** — neighborhood endpoint + canvas + Cypher console.
10. **Capabilities + Settings** — mostly read-only renders of existing endpoints.
11. **Hardening pass** — skeletons, empty/error states everywhere, keyboard audit, dark theme (own ramp, re-validated palette), reduced-motion audit.

New backend work implied (small, mostly thin wrappers): `POST /api/validate`, validation-outcome persistence, `GET /api/context/status` (+drift), `GET /api/health/backends`, `GET /api/sessions`, `GET /api/documents[…]`, `GET /api/graph/neighborhood`, async generate job, trace streaming.

## 6. Prototype ↔ reality map

The prototype stubs with static demo-dataset content (trades/counterparties/FIBO/BR-001…) chosen to be *true to the real system's behavior* — e.g. the trace reproduces the verified live blocked→self-corrected loop; the rejected "Revenue → revenue bond 0.61" alignment is the real precision-first policy example. Buttons marked with a toast ("wired in the implementation spec") are intentionally inert. Interactivity that *is* real in the prototype: navigation + deep links, ⌘K palette, glossary tabs + term drawer, validator case toggle, trace step expansion.

## 7. Open questions (decide before slice 4)

1. Multi-context: is one active context per deployment enough for v1, or does the switcher need real context CRUD?
2. Should validation outcomes be persisted in the artifact store (`semantics/knowledge/`) or a proper DB table? (Overview + rule history depend on it.)
3. Accept/reject alignment write-back: curated alignments live where — context JSON, RDF, or both?
4. Auth story for Studio (none today; matters before any non-local deployment).

---

## 8. v2 expansion — research findings and the five new surfaces

Round-two inputs: a repo audit (platform extension surfaces, reserved runtimes, API/CLI inventory) plus category research across data catalogs, semantic layers, LLM-agent platforms, and KG workbenches. What the audit found that the v1 UI ignored:

- `platform/` defines the product's growth surface: **10 agent roles** (supervisor, researcher, retrieval, reasoning, validator, reporter, ontology, planner, synthesis, coding), **7 workflows** (graph-rag is live-adjacent via the Neo4j projection), **15 connectors**, a **prompts** registry (4 real prompts live in code today: `agents._AGENT_PREAMBLE`, `generate._SYSTEM_PROMPT`, `ontology._RANKING_PROMPT`, `documents._EXTRACTION_PROMPT`), and **policies**.
- Reserved runtimes are UI-shaped: `observability-runtime` (traces, metrics, cost accounting), `memory-runtime` (durable `sessions.db`), `apps/scheduler` (context refresh, drift sweeps), `apps/worker` (bulk ingestion).
- The API already serves more than v1 assumed: `/api/validate`, `/api/sources`, `/api/schema`, `/api/rules`, `/api/rdf`, `/api/context/generate` all exist — several "new endpoint" items in §4 are already closed.

Category research → feature mapping:

| Research finding | Source category | Studio surface |
|---|---|---|
| Semantic layer as code: searchable metric catalog with definition, lineage, ownership, changelog; PR-style review of semantic changes | dbt Semantic Layer / Explorer, Cube ([dbt](https://www.getdbt.com/blog/build-centralize-and-deliver-consistent-metrics-with-the-dbt-semantic-layer), [comparison](https://promethium.ai/guides/top-10-semantic-layer-tools-2026-definitive-comparison/)) | **Changes** page: version timeline, semantic diff, audit ledger; owner/steward chips |
| Stewardship & approval workflows; glossary curation as governed process | Collibra / OpenMetadata / DataHub ([comparison](https://www.stackfyi.com/guides/data-catalog-tools-atlan-collibra-datahub-openmetadata-2026), [open-source catalogs](https://thedatagovernor.com/open-source-data-catalog-tools/)) | **Changes → Awaiting review** queue (LLM proposes, steward decides); governance field in the term drawer |
| Datasets/experiments, LLM-as-judge **plus** code evaluators, baseline comparison, CI gates that fail a build on score regression | LangSmith / Langfuse ([comparison](https://www.datacamp.com/blog/langfuse-vs-langsmith), [LangSmith](https://www.langchain.com/resources/langsmith-vs-langfuse)) | **Evaluations** page — with the Polanyi twist: deterministic rule-enforcement suites first (adversarial SQL that MUST be blocked), judge only where judgment is needed; 👍/👎 in Agent Workspace feeds new cases |
| Cost/token/latency accounting per trace; production monitoring | LangSmith / Langfuse (as above) | **Activity** ledger columns + per-answer cost chip in Agent Workspace |
| SPARQL workbench conventions: syntax-highlighted editor, endpoint/engine selection, saved queries, results grid | YASGUI / Stardog Studio / metaphactory ([SPARQL editors](https://rdfandsparql.com/blog/tpost/pbsx7g3ue1-whats-the-best-sparql-editor), [ontology tools](https://www.ovaledge.com/blog/ontology-management-tools)) | **Query Console** — three tabs (SPARQL/Cypher/SQL); the SQL tab runs through `validate_sql`, making the point that rules apply to humans too |
| Supervisor multi-agent topology rendered as a graph (nodes = agents, edges = handoffs) | LangGraph Studio / supervisor pattern ([LangGraph](https://www.langchain.com/langgraph), [supervisor pattern](https://callsphere.ai/blog/langgraph-supervisor-multi-agent-orchestration-2026)) | **Registry & Extensions → Agents & Workflows** topology view (live agent solid, reserved roles dashed) |
| Prompt hub: versioned, pinned prompts with a playground/preview | LangSmith Prompt Hub / Langfuse prompt management | **Registry & Extensions → Prompts** + "What the agent sees" rendered-preamble panel |

### 8.1 New page specs (concise)

**Changes** — *Data:* context versions from the artifact store (semantic_context.json snapshots); diff computed structurally (terms/rules/alignments added-changed-removed) *(new: `GET /api/context/versions`, `GET /api/context/diff?from=v13&to=v14`)*; review queue *(new: curation-proposal store + `POST /api/reviews/{id}/approve`)*; audit ledger *(new: append-only audit log — also satisfies enterprise compliance asks)*. Diff markers: `+` good / `~` warn / `−` bad, mono. Empty state: "One version so far — diffs appear after your second `polanyi generate`."

**Evaluations** — *Data:* suite/case store *(new: `semantics/knowledge/evals/` + `GET/POST /api/evals`, `POST /api/evals/run?context=v14`)*. Two check kinds, visually distinct via the provenance vocabulary: `⬢ deterministic` (must-block suites reuse `validate_sql` — zero token cost, the same trick as Langfuse code evaluators) and `✦ judge`. Comparison panel is version-vs-version on identical cases; baseline = previous published version. CLI: `polanyi eval --suite … --fail-under …` for CI.

**Query Console** — *Data:* SPARQL via existing GraphDB proxy (pyoxigraph fallback chip mirrors the LLM-optional principle); Cypher via guarded `RunCypher`; SQL via `POST /api/validate` + `ExecuteSQL` *(the gate is not bypassable from the console — deliberate)*. Add query history + saved queries *(new, local-first)*. The default SPARQL example is the product's money shot: glossary ⋈ FIBO in one query because they share a store.

**Activity** — *Data:* run records *(new: observability-runtime lands `GET /api/runs`, `GET /api/runs/{id}` with log lines, token/cost fields)*. Filter chips (All / Asks / Jobs / Scheduled / Failed-held). Job detail = mono log with stage timings; monthly cost-by-stage line. Scheduled rows attributed to `apps/scheduler` (reserved) — the UI names the architecture honestly.

**Registry & Extensions** (rework) — five tabs: Capabilities (v1 table + roadmap), Skills (category inventory from `platform/skills/`, per-skill `skill.yaml` + trust note), Agents & Workflows (topology SVG + workflow inventory with live/reserved status), Connectors (15-row directory: class, status, pipeline stages fed), Prompts (registry table pinned to context version + rendered agent-preamble preview). Prompt edits route through **Changes** and re-run eval suites before pinning — the three v2 systems interlock.

### 8.2 Slice-plan updates

Existing slices 1–11 stand; the expansion appends (still vertical, still PR-sized):

12. **Query Console** — cheapest v2 win: all three query paths already have backends; add history/saved-queries local store.
13. **Changes (read path)** — version snapshots + structural diff + audit ledger writes on generate/publish/align/curate.
14. **Activity** — run-record persistence in the observability runtime; wrap existing CLI/API entry points with run logging; token/cost capture from LLM client.
15. **Evaluations** — case store + runner (deterministic suites first, judge second); Agent Workspace feedback hook; CI command.
16. **Changes (review path)** — proposal/approval workflow; prompts registry extraction (`platform/prompts/`) rides this slice.
17. **Registry & Extensions tabs** — mostly static renders of `platform/` inventories; topology view reads the LangGraph graph when multi-agent lands.

Priority argument: 12 → 14 → 13 → 15 → 16 → 17. Console and Activity create daily-use pull; Changes/Evals create the enterprise trust story; 17 is showcase.

### 8.3 Additional open questions

5. Audit ledger durability: append-only file in the artifact store vs a proper table; and does it need user identity before an auth story exists?
6. Eval judge model: same configured LLM as the agent, or a pinned separate judge to keep comparisons stable across provider swaps?
7. Cost accounting source of truth: token counts from provider responses vs local tokenizer estimates when NIM/Databricks omit usage fields?
8. Prompt versioning granularity: pin prompts to context versions (as prototyped) or version independently with a compatibility matrix?

---
*Sources consulted for pattern research:* [Atlan — data catalog tools](https://atlan.com/data-catalog-tools/) · [Atlan — semantic layer tools](https://atlan.com/know/best-semantic-layer-tools/) · [Databricks — semantic layer architecture](https://www.databricks.com/blog/semantic-layer-architecture-components-design-patterns-and-ai-integration) · [LangSmith observability](https://www.langchain.com/langsmith/observability) · [Langfuse — AI agent observability](https://langfuse.com/blog/2024-07-ai-agent-observability-with-langfuse) · [StackFYI — catalog comparison 2026](https://www.stackfyi.com/guides/data-catalog-tools-atlan-collibra-datahub-openmetadata-2026) · [The Data Governor — open-source catalogs](https://thedatagovernor.com/open-source-data-catalog-tools/) · [DataCamp — Langfuse vs LangSmith](https://www.datacamp.com/blog/langfuse-vs-langsmith) · [dbt — Semantic Layer](https://www.getdbt.com/blog/build-centralize-and-deliver-consistent-metrics-with-the-dbt-semantic-layer) · [Promethium — semantic layer tools 2026](https://promethium.ai/guides/top-10-semantic-layer-tools-2026-definitive-comparison/) · [RDF & SPARQL — SPARQL editors](https://rdfandsparql.com/blog/tpost/pbsx7g3ue1-whats-the-best-sparql-editor) · [OvalEdge — ontology management tools](https://www.ovaledge.com/blog/ontology-management-tools) · [LangGraph](https://www.langchain.com/langgraph) · [CallSphere — supervisor pattern 2026](https://callsphere.ai/blog/langgraph-supervisor-multi-agent-orchestration-2026)
