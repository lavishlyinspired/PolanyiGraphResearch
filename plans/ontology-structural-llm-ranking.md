# Plan: FIBO Structural Context + LLM Ranking (Story C)

**Branch**: feat/ontology-alignment-studio
**Status**: Active

## Goal

Wire the already-existing (but currently dormant on the interactive path) LLM ranking
into the live review queue, and enrich its prompt with real FIBO parent/children
structural context fetched via SPARQL — no Neo4j, no new dependency. Ranking is eager:
every review-band (0.50–0.89) term gets re-ranked by the LLM on every queue fetch, per
the user's explicit choice, and gracefully no-ops when no LLM provider is configured
(`resolve_llm()` already returns `None` in that case — this is a real, existing
graceful-degradation path, not new).

## Context

- `_rank_with_llm()` (`packages/semantic-runtime/semantic/ontology.py:212`) already
  exists and is wired into `align_glossary()` (the *bulk* `/api/context/align`
  endpoint). The *interactive* review queue — `alignment_queue()`, what the Ontology
  page actually renders — is 100% lexical today; the LLM never runs there.
- `search_classes()` already computes subclass counts (`subCount`) via a
  `rdfs:subClassOf` `GROUP BY` for the structural score boost, so a direct-parent
  SPARQL query is a small, natural addition alongside it — not new infrastructure.
- **Correctness risk this plan must close**: `accept_alignment()` independently
  re-derives "the best candidate" via its own `search_classes()` call. If
  `alignment_queue()` starts showing an LLM-ranked candidate that isn't the top
  lexical hit, but `accept_alignment()` keeps deriving pure-lexical-best, a user could
  review candidate A and silently persist candidate B on Accept. Both must resolve
  "the current best candidate for this term" through one shared function.

## Non-goals

- No SBERT/embeddings (Story B — separate plan, deferred).
- No auto-persisting an LLM's ranked choice — ranking changes what's *displayed* and
  what Accept would persist if the user accepts; it never moves a term out of the
  `review` band or writes `ontology_uri` without an explicit accept.
- No change to the bulk `/api/context/align` endpoint's existing behavior/tests.

## Acceptance Criteria (feature-level)

- [ ] A review-band term's displayed candidate reflects the LLM's pick among
      real retrieved candidates (≥0.50), when an LLM provider is configured.
- [ ] With no LLM provider configured, the queue's output is byte-for-byte identical
      to today's lexical-only behavior (existing tests must pass unchanged).
- [ ] Accepting a term always persists exactly the candidate that was displayed for
      it — never a re-derived, possibly different one.
- [ ] The LLM ranking prompt includes each candidate's real immediate parent and
      children labels fetched from GraphDB, not invented structure.

## Slices

### Slice 1: LLM ranking wired into the interactive queue, with shared accept-consistency

**Value**: A user reviewing an ambiguous term sees the LLM's actual pick (which may
differ from the naive top lexical score) instead of always the raw top hit — and
Accept can never drift from what was shown.
**Path**: `alignment_queue(context, store, llm=None)` gains an `llm` param. For any
item whose classification would be `review`, candidates ≥ 0.50 are passed through a
new shared `_resolve_best_candidate(entry, candidates, llm)` — returns the LLM's
choice when `llm` is given and it picks one, else the top-lexical candidate (today's
behavior). `accept_alignment(context, term, store, llm=None)` calls the *same*
shared function to decide what to persist. The API's `/api/context/align/queue` and
`/api/context/align/{term}/accept` both pass `resolve_llm("pipeline")`.
**Required implementation skills**: `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Acceptance criteria**:
  - Given a review-band term with candidates where the LLM picks the *second*-ranked
    lexical candidate, the queue item's `candidate_uri`/`candidate_label` show that
    second candidate, not the top one.
  - Given the same setup, calling accept persists that same second candidate's
    URI/label — not a re-derived top-lexical one.
  - Given `llm=None` (no provider configured), `alignment_queue()` output is identical
    to before this change — existing `test_alignment_queue_buckets_glossary_terms_by_confidence`
    and friends pass unchanged.
  - Given the LLM declines (`chosen_uri: null`), the term keeps showing the raw
    top-lexical candidate (today's behavior) — declining doesn't hide the term or
    force it to `unmapped`.
  - `auto` and `unmapped` bands are untouched by this slice — ranking only ever
    applies within the `review` band.
**RED**: `test_ontology.py` — new tests: (a) LLM picks non-top candidate → queue
reflects it; (b) accept persists the LLM-picked candidate, not a re-derived one; (c)
`llm=None` behaves exactly as the existing suite already asserts (run unchanged as a
regression guard); (d) LLM declines → raw top-lexical candidate still shown. Mutator
gaps: `review`-only guard removed (would rank `auto`/`unmapped` too — cheap on
`unmapped` since candidates would be < 0.5 and `_rank_with_llm`'s existing floor
already filters those, but must not touch `auto`), llm-None branch accidentally
calling `_rank_with_llm(entry, candidates, None)` and crashing.
**GREEN**: Extract `_resolve_best_candidate`, thread `llm` through both functions and
the two endpoints.
**Done when**: All acceptance criteria met, mutation report reviewed, human approves commit.

### Slice 2: Real FIBO parent/children context in the ranking prompt

**Value**: The LLM ranking in Slice 1 gets meaningfully better signal — "this
candidate sits under DebtInstrument, with children Bond/Loan" — addressing the
right-level-of-abstraction question Barrasa's structural approach targets, without a
graph database.
**Path**: New `GraphDBOntologyStore` method fetching a class's immediate parent
label(s) and immediate children labels via SPARQL (`rdfs:subClassOf` one hop each
direction — reuses the query shape already in `expand_subclasses`/`search_classes`).
`_rank_with_llm()`'s candidate listing gains this context per candidate;
`_RANKING_PROMPT` template updated to surface it.
**Required implementation skills**: `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Acceptance criteria**:
  - For a candidate with a known parent and children in the fake/test store, the
    rendered prompt text contains the real parent label and real children labels.
  - A candidate with no parent (ontology root) or no children (leaf) renders without
    a crash and without inventing placeholder structure (omits the empty side).
  - Existing Slice 1 tests still pass unchanged (prompt enrichment is additive).
**RED**: `test_ontology.py` — unit test on the new parent/children fetch method
against a fake SPARQL response; a `_rank_with_llm` test asserting the prompt sent to
a capturing fake LLM contains real parent/children text. Mutator gaps: parent vs
children query swapped, one-hop query accidentally matching transitive (multi-hop)
relations instead of immediate ones.
**GREEN**: Minimum SPARQL query + prompt template change.
**Done when**: All acceptance criteria met, mutation report reviewed, human approves commit.

## Pre-PR Quality Gate

Before each PR:
1. Manual mutation pass (no Python mutation harness configured — see
   `plans/ontology-alignment-studio.md`'s gate for the same note)
2. Refactoring assessment
3. Backend test suite green (`pytest`)
4. Confirm `/api/context/align/queue` and `/accept` behave identically to today when
   no LLM provider is configured (the graceful-degradation path this whole plan
   depends on) — run once with `POLANYI_LLM_PROVIDER=none` as a manual check.

---
*Delete this file when the plan is complete.*
