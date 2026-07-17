# Product

## Register

product

## Users

Data-platform engineers, semantic-layer stewards, and AI-agent builders at enterprises (finance-first demo domain). They sit at a desk on a large monitor, in a governance mindset: connecting databases, curating a business glossary, declaring business rules, aligning terms to ontologies (FIBO), and auditing what an AI agent did and why. Secondary: analysts who ask the grounded agent questions and need to trust the answer.

## Product Purpose

Polanyi Works is a semantic runtime that grounds AI agents in database schemas, business glossaries, ontologies, and symbolically-enforced business rules. The Studio UI is where that runtime becomes visible: generate semantic context from schemas, govern rules, review ontology alignments, ingest documents, explore the knowledge graph, and — the hero — watch an agent's reasoning trace where the symbolic validator blocks bad SQL and the agent self-corrects. Success looks like: a user trusts an agent answer because they can see exactly what grounded it and what gated it.

## Brand Personality

Scholarly, precise, evidential. Named for Michael Polanyi ("we know more than we can tell") — the product makes tacit institutional knowledge explicit and enforceable. The UI should feel like a well-kept research instrument: calm authority, annotated provenance, verdicts as stamps in a ledger. Never playful-startup, never enterprise-beige.

## Anti-references

- Generic SaaS admin dashboards: KPI hero-tile rows, gradient accents, identical card grids.
- "AI product" clichés: purple-to-blue gradients, sparkle-everything, chat as the only surface.
- Enterprise data-catalog blandness (undifferentiated gray tables with no point of view).

## Design Principles

1. **Provenance is the interface.** Every fact shows how it was derived — schema-derived (deterministic), LLM-enriched, or declared. The symbolic/neural distinction is a visible color vocabulary, not documentation.
2. **Verdicts are first-class.** PASS/BLOCKED are stamps with rule citations, rendered honestly — including in the agent's own trace. Blocked queries are a feature, not an error state to hide.
3. **The ledger, not the dashboard.** Dense, scannable tables and activity ledgers over vanity metrics. Density is respect for the expert user.
4. **The tool disappears into the task.** Familiar product patterns (sidebar nav, command palette, inspector drawers); delight lives in moments (the self-correction trace), not decoration.
5. **LLM-optional everywhere.** Surfaces must degrade gracefully when no model key is present; deterministic features never look secondary.

## Accessibility & Inclusion

WCAG 2.2 AA. Body text ≥ 4.5:1; status/verdict colors always paired with icon + label (never color alone — validated CVD-safe categorical palette for graph views); visible focus states; full keyboard navigation including the command palette; `prefers-reduced-motion` honored on all transitions.
