# Taxonomy Reconciliation & the "23-stage semantic pipeline" proposal — review + implementation plan

**Status:** Review complete, incorporating one round of feedback (see "Response to feedback" below), Slice 1 ready to plan
**Input:** an externally-generated architecture proposal (taxonomy reconciliation → 23-stage
pipeline → 6 layers → 40-60 "semantic capabilities" → GraphDB/Neo4j/Python role split → 6-phase
build order → 7-agent hierarchy → "GraphOS Studio" with a marketplace)
**Verdict:** the *problem* (taxonomy reconciliation) is real and worth building. The *pipeline*
should not be adopted as a blueprint — this project already tried the "scaffold everything, then
fill it in" approach once, and the evidence is sitting in the repo right now.

## The load-bearing finding

Before reacting to the proposal's vision, I checked what's actually in this codebase. Two things
matter more than anything else in this review:

**1. A lot of the proposed pipeline already exists, just not organized as a named 23-stage
pipeline.** Verified by reading the real code, not assumed:

| Proposal's stage | Real, working code today |
|---|---|
| 3. Schema Discovery | `semantic/introspect.py` — real SQLAlchemy introspection |
| 4. Business Glossary Extraction | `semantic/generate.py`'s `deterministic_context`/`generate_context` |
| 6. Ontology Alignment | `semantic/ontology.py`'s `align_glossary` — real FIBO alignment via GraphDB SPARQL, lexical scoring (`score_label`) + LLM-assisted ranking for ambiguous cases, `skos:exactMatch` output (`semantic/rdf.py`) |
| 8. Semantic Mapping | Term→owl__Class graph edges in Neo4j (`RECONCILED_TO_FIBO_CLASS`, added this session) |
| 12. Knowledge Graph Construction | `execution/knowledge_graph.py`'s `Neo4jGraphStore.materialize()` |
| 13. Validation & Constraint Checking | Real pySHACL validation (`semantic/rdf.py`), real business-rule SQL validation (`execution/validate.py`) |
| 16-17. Embeddings & Vector Indexing | `semantic/embeddings.py`, real term embedding index + hybrid search in Neo4j |
| 18. Graph Analytics | Real GDS PageRank, Louvain communities, KNN similarity, weighted degree centrality (`execution/gds_tools.py`) |
| 19. Semantic Reasoning | Real OWL reasoning via Owlready2 (`semantic/owl.py`'s `reason_about_class`) |
| 20. Agent Context Generation | `semantic/prompt.py`'s `build_agent_prompt` |
| 21-22. Planning & Agent Execution | The whole Supervisor/Specialist `SemanticAgent` architecture (real LangGraph `create_agent`, real tool-calling, real streaming) |
| GraphRAG (unnamed in the proposal's list, but real) | `execution/graphrag_pipeline.py` using the real `neo4j_graphrag` package |

That's roughly 11 of the proposal's 23 stages already real and tested. The proposal was written
without seeing this, so it reads as a from-scratch plan. It isn't one — most of "Phase 1: Semantic
Engine" in the proposal's 6-phase build order is already built.

**2. This project already tried the "scaffold the whole architecture first" approach, and it
didn't get built.** `platform/` contains these directories, checked directly:

```
platform/connectors/{neo4j,s3,azure,databricks,snowflake,postgres,jira,github,mysql,
                      sqlserver,confluence,sharepoint,files,rest,graphdb}
platform/plugins/{neo4j,enterprise,databricks,ai,finance,community,graphdb}
platform/workflows/{research,reporting,ingestion,analysis,graph-rag,ontology,finance}
platform/agents/{validator,reporter,planner,synthesis,ontology,reasoning,retrieval,
                  coding,researcher,supervisor}
platform/policies/
platform/prompts/
```

**Every one of these is empty** — no files besides an occasional `README.md`. This is exactly the
shape of the proposal's Phase 1-3 (semantic engine → skills catalog → planner/coordinator/7-agent
runtime), planned out as a folder structure at some earlier point, and never filled in.

Meanwhile, the actual working capabilities of this project live somewhere much narrower and less
symmetrical: `packages/kernel/`, `packages/semantic-runtime/`, `packages/execution-runtime/`,
`packages/agent-runtime/`, plus `platform/specialists/`, `platform/agent-skills/`, and a handful of
real entries under `platform/skills/`. None of these match the proposal's clean 6-layer taxonomy.
What they have in common instead: each one shipped because a *specific, real question* needed
answering (ontology specialist because raw ontology tools confused the supervisor; graph specialist
because Neo4j tools needed the same fix; progressive disclosure because a cross-specialist question
mis-routed; real KYC data + GDS concentration risk because a real compliance question needed a real
answer) — built with TDD, mutation-tested, live-verified against real data, one vertical slice at a
time.

That's the actual lesson of this repo's own history: **the sprawling architecture doesn't get built
by scaffolding it top-down. It gets built by solving real problems bottom-up, and the architecture
that results is whatever those solutions actually needed.** The proposal's 40-60 capability catalog,
7-agent hierarchy (Planner → Coordinator → Semantic/Investigation/Knowledge/Execution/Reflection),
multi-tier memory system, and "GraphOS Studio" marketplace/domain-packs vision are the same shape of
thing as the empty `platform/agents/` folder — plausible-sounding, not wrong in the abstract, and not
something to build speculatively.

## What's genuinely good in the proposal

Filtering out the over-scoped parts, two ideas are real, well-motivated, and currently missing:

### 1. Taxonomy reconciliation itself (the actual subject of the shared document)

This is real and distinct from what `align_glossary` already does. Today, ontology alignment goes
**one glossary → FIBO**. There is no step that reconciles **glossary A → glossary B** when two
different data sources describe the same business concept differently. Concretely, in this
project's own demo data right now: `financial_demo.db` has `counterparties` / `instruments` while
`kyc_portfolio_demo.db` has `legal_entities` / `securities` — the same underlying business concepts,
named differently, currently treated as entirely unrelated because each was only ever aligned
independently against FIBO. Nothing today would tell you `Counterparty ≈ LegalEntity`.

The valuable insight from the proposal worth keeping: taxonomy reconciliation is **simpler** than
full ontology alignment (mostly label + hierarchy matching, not full OWL semantics) and sits
naturally **before** it in the pipeline — reconcile sources against each other first, then align the
reconciled concept against FIBO once, not once per source.

### 2. Entity/identity resolution

Also real and missing, and it lines up with data already in this project: the 358 real GLEIF legal
entities materialized this session have no deduplication or cross-reference logic (e.g., is
"HDFC Bank Limited" the same real entity if it shows up under a slightly different legal name from a
different feed?). This is a legitimate next capability but is **not** part of this plan — it's named
here so it isn't lost, to be scoped as its own future document once taxonomy reconciliation ships and
proves the same review/accept-reject pattern out.

## Response to feedback: generalize into a "Matching Engine" now?

After the first draft of this plan, the reviewer proposed going further: instead of
`align_glossary()`/`reconcile_taxonomies()`/future `entity_resolution()` as siblings, build a
generic Matching Engine up front — a `Matcher` interface with 8 named strategies (`OntologyMatcher`,
`TaxonomyMatcher`, `SchemaMatcher`, `EntityMatcher`, `IdentityMatcher`, `ColumnMatcher`,
`GlossaryMatcher`, `RelationshipMatcher`), a generic `MatchCandidate` record, and one shared
review queue/API/UI — plus a pluggable scoring pipeline (Lexical → Embedding → Ontology Reasoning →
Graph Similarity → LLM Verification → Confidence Fusion) so `score_label` isn't the permanent
strategy.

**What's genuinely right in this:** the `MatchCandidate` shape observation is accurate — Slice 1's
own `TaxonomyMatch` is already structurally identical to `AlignmentReviewItem` (score + band +
accept/reject), so the two *are* the same shape of problem. And the GraphDB-persistence point
(`skos:exactMatch`/`broadMatch`, not just a Python-side decision) was already Slice 2's design, not
a gap — worth confirming explicitly rather than treating as new.

**Where this plan does not adopt the proposal as written:** building the 8-matcher engine now is the
same pattern this document's own load-bearing finding just presented first-party evidence against.
Six of the eight named matchers don't exist and haven't been through even a first-pass "what's the
real motivating scenario" analysis — that's how `platform/agents/` ended up empty: naming a system's
shape before any concrete case proved what the shape needs to be. Concretely, the interface risk
isn't hypothetical: ontology alignment queries an *external store* per-term over SPARQL
(network-bound, targeted lookups); taxonomy reconciliation (Slice 1) scores two *in-memory lists*
pairwise (no network, no store). A generic `Matcher.match(source, target, strategy)` has to cover
both shapes correctly on the first attempt, with only one of the two even built — real risk of either
leaking the abstraction immediately or forcing ontology alignment to pre-fetch all of FIBO into
memory just to fit the interface, a genuine regression, not a neutral refactor. The pluggable
Lexical → Embedding → Reasoning → Graph → LLM → Fusion scoring pipeline has the same issue one level
down: this project's own repeated pattern this session (the LLM-tier fix, the three-round routing
fix) is *verify empirically first, generalize second* — design the second scoring strategy once
Slice 1's live verification shows a real case `score_label` actually misses, not before.

**The synthesis this plan adopts instead:** two low-cost, evidence-respecting changes rather than
the full engine. First, `TaxonomyMatch`'s fields are named toward the shared vocabulary from the
start (`source`/`target`/`confidence`/`band`, not `term_a`/`term_b`/`score`) — free, and keeps the
door open without committing to anything. Second, Slice 4 below is an explicit assessment
checkpoint, done *after* two real matchers exist, using their actual shapes as evidence — the Rule
of Three, not the rule of two-plus-six-imagined.

## What to explicitly not build right now

Named so the decision is visible, not silently dropped:

- **The 40-60 "semantic capability" catalog.** No evidence yet that this project needs a formal
  capability taxonomy broader than what `CapabilityRegistry` already provides. Revisit if/when the
  number of real tools actually gets unwieldy — it currently doesn't.
- **The 7-agent hierarchy (Planner/Coordinator/Semantic/Investigation/Knowledge/Execution/
  Reflection).** This session's own real evidence argues against adding agent layers speculatively:
  even the *current* 2-specialist system produced a real, live-verified mis-routing bug (S23) that
  took three rounds of fixes to resolve (S24). Adding five more coordination layers before that kind
  of problem is even fully solved at the current scale would compound the same risk, not reduce it.
- **Multi-tier memory system** (semantic memory in GraphDB, operational memory in Neo4j, workflow
  memory, long-term memory as separate stores). The current single LangGraph checkpointer has not
  yet shown a real limitation that would justify this.
- **"GraphOS Studio" marketplace, domain packs (Finance/Healthcare/Manufacturing), policy engine,
  prompt library as dedicated pages.** All speculative for a platform that hasn't finished its first
  real domain (financial services) yet.
- **Continuous learning & feedback loop.** No user feedback mechanism exists to learn from yet —
  building the learning loop before the thing it learns from is a real case of designing for a
  hypothetical.
- **A generic, automated Source Discovery / Metadata Harvesting crawler** across arbitrary APIs,
  files, SaaS apps, and MCP servers. The current `ConnectSourceRequest` (name/kind/uri, explicit)
  model works for what's actually connected today (SQL, Databricks). Generalize only when a second,
  real source type shows up that the current model can't express.

## Where GraphDB / Neo4j / Python responsibilities already stand

The proposal's three-way split (GraphDB = semantic brain, Neo4j = operational graph, Python =
orchestration) is a reasonable description of what this codebase **already does**, not a new
decision:

- GraphDB holds FIBO, runs SPARQL + OWL reasoning (`owl.py`), validates via SHACL (`rdf.py`).
- Neo4j holds materialized entities/terms/documents plus this session's new real KYC business graph
  (`Portfolio`/`Position`/`Security`/`LegalEntity`), runs GDS analytics.
- Python (`packages/*`) does introspection, glossary generation, alignment orchestration, agent
  tool-calling, and now real-time streaming.

No architectural change needed here — this is already the shape. The proposal's contribution is
confirming the split is sound, not prescribing a new one.

## Implementation plan: Taxonomy Reconciliation

Scoped as real vertical slices, reusing the **already-built and already-proven** alignment-queue
mechanism (S8/S8b: `score_label`, `_MIN_ALIGNMENT_SCORE`/`_MIN_REVIEW_SCORE` thresholds,
`classify_band`, `AlignmentQueue`, the accept/reject API routes, the Ontology·FIBO Studio page's
review UI) rather than building a second, parallel system. The only genuinely new work is pointing
that same mechanism at **two glossaries** instead of **one glossary + FIBO**.

### Slice 1 — Cross-source concept matching (pure function, no UI yet)

**Value:** given two connected sources' glossaries, surface real candidate concept matches ranked by
the same lexical scorer already used for FIBO alignment — the foundation everything else builds on.
**Path:** new `reconcile_taxonomies(glossary_a: list[GlossaryEntry], glossary_b: list[GlossaryEntry]) -> list[TaxonomyMatch]` in `semantic/ontology.py` (co-located with `align_glossary`, since it's
the same family of problem). Reuses `score_label` unchanged — no new scoring algorithm.
`TaxonomyMatch`'s fields are named toward a shared matcher vocabulary from the start
(`source`/`target`/`confidence`/`band`, not `term_a`/`term_b`/`score`) — a free step toward Slice 4,
without committing to the full abstraction yet.
**Acceptance criteria:**
- Scores every (source, target) pair via the existing `score_label`, keeps only pairs at or above
  the existing `_MIN_REVIEW_SCORE` floor (same "too imprecise to consider" threshold already proven
  for ontology alignment — no new magic number invented).
- Returns real, ranked `TaxonomyMatch { source, target, confidence, band }` records, reusing
  `classify_band` unchanged (`auto`/`review`/`unmapped`, same 0.90/0.50 boundaries).
- A term with no candidate above the floor in the other glossary correctly produces no match, not a
  fabricated low-confidence guess.
- Live-verified against this project's own two real demo glossaries (`financial_demo.db`'s
  `deterministic_context` glossary vs `kyc_portfolio_demo.db`'s) — confirm real candidates surface
  (e.g. `Counterparty` ↔ `Legal Name`/`Jurisdiction`-bearing `legal_entities` concepts,
  `Instrument`/`Asset Class` ↔ `Securities`-family concepts), not synthetic test fixtures only.
**Required implementation skills:** `tdd`, `testing`, `mutation-testing`, `refactoring`.

### Slice 2 — Real API + review queue (reusing the S8/S8b pattern, not rebuilding it)

**Value:** a Studio user can review cross-source candidate matches and accept/reject them, exactly
like the existing FIBO alignment queue — no new interaction pattern to learn.
**Path:** `GET /api/context/reconcile?source_a=...&source_b=...` mirrors
`GET /api/context/align/queue`'s existing shape. Accept persists a real `skos:exactMatch` (or
`skos:broadMatch`/`skos:narrowMatch` when the match is a hierarchy relationship, not an equivalence
— the one genuine extension beyond straight reuse) between the two glossary entries in the RDF
export, mirroring `accept_alignment`/`reject_alignment`'s existing persistence shape.
**Acceptance criteria:**
- Same 503-when-unavailable honesty as the existing alignment endpoints.
- Accept/reject actually persists (verified by reading it back, not just a 200 response).
- No fabricated "why these match" narration beyond the real score — same discipline as S8's own
  documented correction ("no invented reasoning prose").
**Required implementation skills:** `tdd`, `testing`, `mutation-testing`, `refactoring`, `api-design`.

### Slice 3 — Studio UI (extend the existing Ontology·FIBO page's pattern, don't build a new page)

**Value:** the review happens where a Studio user would actually look for it.
**Path:** either a new tab on the existing Ontology·FIBO page or a small new page following its
exact existing 3-band queue component — reuse, don't reinvent.
**Acceptance criteria:** Browser Mode tests per this project's React testing convention; live-checked
in a real browser against the real two-source demo data, same discipline as every UI change this
session made.
**Required implementation skills:** `tdd`, `testing`, `react-testing`, `mutation-testing`.

### Slice 4 — Assess: extract a shared Matcher abstraction (only if the evidence justifies it)

**Value:** avoid real, visible duplication once a second matcher genuinely exists, without guessing
the interface from zero.
**Path:** not new production code by default — a REFACTOR-step assessment (per this project's own
refactoring discipline: "assess after the fact, only refactor if it adds value"), done once Slices
1-3 are live and `align_glossary` and `reconcile_taxonomies` both exist as real, working code.
**Acceptance criteria (a decision, recorded either way):**
- Compare the two real implementations' actual shapes: what genuinely varies (external store vs.
  in-memory list; per-term SPARQL vs. pairwise scoring) and what's genuinely identical (score → band
  → review → accept/reject → `skos:*` persistence).
- If the shared part is substantial and the varying part cleanly factors out (e.g., a
  `MatchCandidateSource` the caller supplies — a store-backed one for ontology alignment, a
  list-backed one for taxonomy reconciliation), extract a shared `MatchCandidate` type and a shared
  review-queue/accept-reject/persistence layer — but only the two concrete shapes actually in hand,
  not a speculative interface for `SchemaMatcher`/`EntityMatcher`/`IdentityMatcher`/`ColumnMatcher`/
  `RelationshipMatcher`, none of which exist yet.
- If entity resolution (named above, not scoped here) later needs the same review/accept-reject
  pattern a third time, that's the real Rule-of-Three signal to extend the abstraction — not a
  reason to widen it preemptively now.
- Explicitly do not build a pluggable multi-strategy scoring pipeline (Lexical → Embedding →
  Reasoning → Graph → LLM → Fusion) at this checkpoint. Add a second scoring strategy only when a
  specific, live-verified case shows `score_label` genuinely missing a real match — the same
  verify-then-generalize discipline this project has used everywhere else.
**Required implementation skills:** `refactoring`, `tdd` (if extraction proceeds).

### Explicitly deferred within this plan

- `skos:relatedMatch` (loose association, weaker than broad/narrow/exact) — add only if Slice 1's
  live verification surfaces a real pair that needs it. Don't pre-build the predicate space.
- Hierarchy-aware matching (using each source's parent-child structure, not just flat label
  scoring) — the proposal's "hierarchy alignment" idea is real but adds real complexity; ship
  flat-label reconciliation first, revisit once it's proven useful and a real hierarchy-shaped gap
  shows up.
- Any UI/API for entity/identity resolution — separate initiative, not scoped here.
- The full 8-matcher `MatchingEngine` and the pluggable multi-strategy scoring pipeline (see
  "Response to feedback" above) — revisit only with Slice 4's real evidence in hand.

## Why this plan and not the 6-phase one

The proposal's Phase 1 ("Semantic Engine — Ontology Manager, GraphDB Client, Neo4j Client,
Databricks Client, Metadata Catalog, Mapping Engine, SHACL Validator, Reasoner, Context Builder,
Provenance Manager... no agents yet") describes building ten pieces of infrastructure before any of
them face a real question. This project's own `platform/agents/`, `platform/connectors/`,
`platform/plugins/` folders are the empty result of exactly that instinct, applied to this same
codebase, previously. Three slices that solve one real, named problem (two glossaries in this
project genuinely don't know about each other yet) and reuse code already proven in production is
the version of this idea that will actually ship.
