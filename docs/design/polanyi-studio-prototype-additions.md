# Research Parking Lot — Deferred UI Concepts

**Status: DEFERRED.** This is a research parking lot, not a build queue. Nothing below should become UI without, at minimum: (a) a real backend/data-model spike proving the concept works on this system's actual data, (b) confirmed demand from an actual target persona (data-governance lead, compliance officer, platform engineer — see `PRODUCT.md`), and (c) an explicit scoping check against the anti-pattern `docs/product-vision.md` already diagnosed and rejected: *"The Product Tries to Be 7 Products... Customers don't buy that."* Every cluster below, taken together, reproduces that failure mode at the UI layer — a governance tool trying to also be a metacognition research platform, an institutional-knowledge-mining platform, a graph-analytics platform, and an explainability platform.

**What already shipped from an earlier pass at this list:** the Graph Insights/Anomalies/Communities & Centrality/Similarity Search concepts (§1E, §1H below) were built into the prototype, then consolidated into one tabbed **Graph Insights** page (nested under Knowledge Graph in the sidebar) and honestly labeled experimental — because the backing code (`packages/gnn-runtime`) is a real but disconnected spike: hand-rolled NumPy, no Neo4j GDS calls, no vector index, no tests, not declared in the root `pyproject.toml`. It is not part of the shipped distribution. Do not present it as live in any mockup until it actually is. The **Practices** concept (§1B/§1D below) was removed from the HTML entirely — it has zero backend, zero data model, and belongs here, not in front of a stakeholder.

Everything else in this document (metacognition monitoring, tacit-knowledge/practice mining, symbolic-seam visualization, expert-twin modeling, bitemporal audit) was never built — it's real research (the cited papers are genuine, verified against arXiv) but zero enterprise validation that any of it belongs in *this* product. Treat this file as reference material for future ideation, not a roadmap.

---

## 1. The research findings (clustered)

### 1A. Going Meta — metacognition as a product surface

**Key sources:**
- *Deep Reasoning via Structured Meta-Cognition* (Light et al., arXiv 2605.11388, May 2026) — DOLORES agent constructs task-specific reasoning scaffolds; meta-reasoning is represented as executable decompositions
- *Meta-Reasoner* (arXiv 2502.19918) — dual-process architecture: LRM generates CoT, Meta-Reasoner provides strategic oversight via contextual bandits
- *Deep Search with Hierarchical Meta-Cognitive Monitoring* (Sun et al., arXiv 2601.23188, Jan 2026) — Fast Consistency Monitor + Slow Experience-Driven Monitor
- *MetaCognition Patterns for AI Agent Self-Monitoring* (Zylos Research, Mar 2026) — MAPE-K loop applied to agent runtimes
- *Me, Myself, and π — LLM Introspection* (Naphade et al., arXiv 2603.20276, Mar 2026) — Introspect-Bench evaluates genuine meta-cognition vs. text self-simulation
- *The Model Is Not the Product — MRA* (MindHYVE.ai, Mar 2026) — Metacognitive Reasoning Architecture

**Reality check:** none of this has a data model in Polanyi today. There is no "strategy selection" log, no confidence-calibration store, no MAPE-K loop anywhere in the codebase. Building a "Metacognitive Monitor Dashboard" mockup would be pure fiction layered on top of an already-fictional backend — a step further removed from reality than the Graph Insights situation this document opens with.

**Deferred concepts:** Agent Reasoning Confidence Panel (Agent Workspace), Metacognitive Monitor Dashboard (Monitor/Analyze/Plan/Execute loop).

### 1B. Tacit Knowledge — Polanyi's core insight as a runtime concept

**Key sources:**
- *Tacit Knowledge Is Your Next Competitive Moat* (California Management Review, Mar 2026)
- *We Know More Than We Teach Our Agents* (Ed Daniels, Medium, Apr 2026)
- *From Knowledge Graphs to Practice Graphs* (Elmoukhliss, Medium, May 2026) — Practice Graph: reusable ways of doing, typed by mode of engagement
- *Knowledge Activation: AI Skills as Institutional Knowledge Primitive* (arXiv 2603.14805, Mar 2026) — Atomic Knowledge Units (AKUs), deployed at Yahoo
- *Agentic Knowledge Fabric* (Broda, Medium, Mar 2026) — concept cards, policy cards
- *Context Graphs* (Masood, Medium, Jan 2026) — "explanation packets" = answer + evidence paths + provenance + policy constraints

**Reality check:** this is the most thematically resonant cluster (it's literally the product's namesake insight), but also the least backed. There is no session-mining pipeline, no pattern-extraction logic, no AKU registry, no scoring model (recency/breadth/freshness) anywhere in the code. A "Practices" page was built once as pure mock data and has been removed from the prototype for that reason. If this direction is ever pursued, it needs a real spike first: can session transcripts actually be clustered into repeatable patterns with today's session store? That's a data-science question, not a UI question.

**Deferred concepts:** Practices View, Explanation Packet View, Knowledge Activation Registry.

### 1C. Symbolic Seams — making the neurosymbolic contract architectural

**Key sources:**
- *Symbolic Seams for Composable Neuro-Symbolic Architectures* (Schuler, Scotti & Mirandola, [arXiv 2603.15087](https://arxiv.org/abs/2603.15087), Mar 2026) — four design commitments: typed boundary objects, evolvable constraint bundles, externalized reasoning traces, bounded change propagation
- *Forethought: Verifiable Reasoning from Neurosymbolic Primitive Programming* (arXiv 2607.04096, Jul 2026)
- *TACET: Self-Distilling Neuro-Symbolic Cascade* (GitHub, 2026) — three-tier cascade with distillation downward
- *Post-LLM Architectures* (Fallbrook Research, Jan 2026)

**Reality check:** this is the cluster closest to what Polanyi already does well — the Validator and Agent Workspace trace already show a neural step handing off to a symbolic gate. The "Symbolic Seam" framing is a genuinely good *lens* on the existing Validator/trace UI, worth revisiting as a **relabeling or light enhancement of what exists**, not a new page. The three-tier cascade (TACET) and formal constraint-bundle versioning are a different matter — no cascade router exists, no constraint-bundle version store exists beyond the context version already in Changes.

**Deferred concepts:** dedicated Boundary-Object/Constraint-Bundle/Decision-Receipt panels as new UI; Cascade Router View. **Worth a cheap revisit:** whether the existing Validator page's verdict display could adopt seam vocabulary without adding new surfaces — an editorial pass, not a new feature.

### 1D. Expert Twin / Cognition Modeling

**Key sources:**
- *AI Expert Twin: Capturing Expert Cognition* (arXiv 2605.01401, May 2026)
- *Environment Maps for Long-Horizon Agents* (arXiv 2603.23610, Mar 2026)
- *Leveraging LLMs for Tacit Knowledge Discovery* (arXiv 2507.03811, Jul 2025)

**Reality check:** same status as 1B — zero backend, and additionally requires attributing agent decisions to specific human experts' patterns, which is an org-modeling problem bigger than this product's current scope.

**Deferred concepts:** Expert Decision Patterns, Decision Trace Attribution.

### 1E–1H. Knowledge Graph UX, Audit/Compliance, Neo4j Analytics — see the consolidated Graph Insights page

Perspective selectors, guided-walk story mode, gap detection, GDS algorithm dashboards, and vector search were the most implementation-adjacent items in the original research pass, because `packages/gnn-runtime` at least exists as code. They were built, then consolidated into the single **Graph Insights** page (Overview / Anomalies / Communities & Centrality / Similarity Search tabs), honestly badged experimental. Anything further here (interactive graph controls needing a canvas library, perspective switching, guided-walk mode) should wait until `gnn-runtime` is actually wired to the API, tested, and — if the GDS critique holds — migrated off hand-rolled NumPy onto real Neo4j GDS calls. Building more UI on top of an unwired spike compounds the same mistake rather than fixing it.

**Governance/audit items genuinely worth keeping on the near-term roadmap** (separate from the graph-analytics cluster, and much better grounded): a governance-posture summary on Overview, audit-trail export, and bitemporal (valid-time vs. transaction-time) display on the Changes page. These don't require new subsystems — they're presentation layers over data the Changes page's audit ledger already models. Low complexity, real enterprise-trust value; reasonable candidates for the next planning pass.

---

## 2. What this document is for

Keep this as a reading list and an idea inventory. When picking up any item:

1. Write the one-sentence enterprise use case first — who asks for this, in what job, moving what decision.
2. Check whether a backend spike is even feasible with today's data (session store, semantic context, knowledge graph).
3. Scope it as tightly as the Changes/Evaluations/Query Console pages were scoped — one page, real API mapping, honest empty/experimental states.
4. If it can't clear those three bars, it stays here.

## 3. Research sources consulted

### Academic papers (2025–2026)
1. Light et al., "Deep Reasoning in General Purpose Agents via Structured Meta-Cognition" (arXiv 2605.11388, May 2026)
2. "Meta-Reasoner: Dynamic Guidance for Optimized Inference-time Reasoning" (arXiv 2502.19918)
3. Sun et al., "Deep Search with Hierarchical Meta-Cognitive Monitoring" (arXiv 2601.23188, Jan 2026)
4. Naphade et al., "Me, Myself, and π: Evaluating and Explaining LLM Introspection" (arXiv 2603.20276, Mar 2026)
5. Schuler, Scotti & Mirandola, "Beyond Monolithic Models: Symbolic Seams for Composable Neuro-Symbolic Architectures" ([arXiv 2603.15087](https://arxiv.org/abs/2603.15087), Mar 2026) — verified real
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
27. Neo4j Bloom (2025–2026 releases)
28. Knogra — scenes, spatial transitions, guided walks
29. NODUSmap — dual-layer comparison, OWL/RDF export
30. CoExplorer Workbench
31. LangSmith / Langfuse — agent observability and evaluation
32. Neo4j GDS Library v2.13 (2025) — PageRank, Louvain, Node2Vec, betweenness centrality
33. Neo4j Vector Index (5.x+) — cosine/euclidean similarity, hybrid search

**Note on sourcing:** a spot-check verified papers #1 and #5 are real, correctly attributed arXiv preprints. A real paper existing is not the same as a validated enterprise feature — treat every item in §1 as a research lead, not a demand signal.
