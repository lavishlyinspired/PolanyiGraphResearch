# Plan: S5 — Browse the governed glossary

**Status**: In progress. Backend: fully ready (`GET /api/context` → `SemanticContext.glossary: GlossaryEntry[]`, `.business_rules: BusinessRuleContext[]`). Zero new backend needed.

**Real finding, changes scope**: `GlossaryEntry` (`packages/common/models.py`) has **no provenance field** — no schema-derived/LLM-enriched/declared marker per term, despite the prototype design showing this prominently as chips. Descoping provenance from the frontend rather than fabricating it. Noted as a real backend gap for a future slice (would need `SemanticContext` generation to actually track and stamp provenance per glossary entry — nontrivial, not in scope here).

**"Governing rules" is real, derived data**: a term's governing rules = business rules whose `affected_entities` intersects the term's `source_tables`. Pure derivation function, same pattern as `verdict.ts` — Node-tested, real Stryker.

## Acceptance criteria

- Glossary table: term, definition, FIBO alignment (from `ontology_class`/`ontology_uri` — real fields), source tables/columns, synonyms.
- Term drawer (click a row): full detail + which rules govern it (derived, cross-referenced for real).
- No inline editing (explicit story scope).
- Terms with no FIBO alignment show that honestly (not a fabricated "unaligned" provenance claim — literally: `ontology_class` is null).
