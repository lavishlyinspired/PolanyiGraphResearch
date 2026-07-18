# Plan: Ontology Alignment Studio (FIBO)

**Branch**: feat/ontology-alignment-studio
**Status**: Active

## Goal

Redesign the Ontology · FIBO page into a dashboard + split list/detail + graph-canvas
experience (visually in the style of `.opencode/plans/src 2`, rebuilt with Tailwind +
shadcn/ui + lucide-react), backed entirely by the real deterministic lexical-alignment
pipeline already in `packages/semantic-runtime/semantic/ontology.py` — no simulated
scores, no fabricated methods (no Node2Vec/Louvain/OWL-reasoner labels that don't exist
in this codebase).

## Non-goals (explicitly out of scope for this plan)

- No embeddings, graph algorithms, or LLM ranking pipeline. Only the existing lexical
  `score_label` + structural boost is real; nothing else gets simulated to look real.
- No relation typing (equivalent/subsumption/part-of) — the backend doesn't classify
  this today and inventing it in the UI would be fabricated data.
- No physics-based/force-directed graph simulation — node positions are computed by a
  deterministic, testable layout function over real topology, not a fake simulation.

## Context / prerequisite bug

`generate_context()` → `_glossary_from_columns()` (`packages/semantic-runtime/semantic/generate.py`)
always builds fresh `GlossaryEntry` objects with `ontology_class=None` /
`ontology_uri=None`. Every "Generate context" click silently destroys previously
accepted FIBO alignments. Confirmed live: `semantic_context.json` currently has all 42
terms with null alignment despite GraphDB having real matches available. Slice 1 fixes
this; every later slice assumes accepted alignments survive a regenerate.

## Acceptance Criteria (feature-level)

- [ ] Accepting/rejecting a FIBO alignment survives a subsequent "Generate context" call.
- [ ] The Ontology page shows real dashboard counts (auto/review/rejected/unmapped + avg score).
- [ ] A user can filter/search glossary terms and see a detail panel with the term's real
      top FIBO candidate(s), each with a real score and a real (backend-computed) reason.
- [ ] A user can accept a specific candidate (not only the top-ranked one) or reject.
- [ ] A graph canvas renders the real term↔FIBO-class topology with deterministic layout,
      and clicking a node selects the same term in the list/detail panel.
- [ ] All new UI is built with Tailwind + shadcn/ui + lucide-react, scoped to the
      Ontology page (existing pages keep their current plain-CSS system unchanged).

## Slices

Every slice follows RED-GREEN-MUTATE-KILL MUTANTS-REFACTOR. No production code without a failing test.

### Slice 1: Accepted FIBO alignments survive context regeneration

**Value**: A user who has accepted/rejected FIBO alignments doesn't lose that work the
next time they (or an auto-flow) regenerate the semantic context.
**Path**: `POST /api/context/generate` → `generate_context()` → `deterministic_context()`
/ `llm_context()` → `_glossary_from_columns()` builds fresh entries → **new**: merge step
copies `ontology_class`/`ontology_uri`/`rejected_ontology_uris` from the previous
context's matching term (by `term` string) onto the freshly generated entry → persisted
via `save_context()`.
**Required implementation skills**: `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Acceptance criteria**:
  - `generate_context(snapshot, rules, llm=None, previous=<ctx with an accepted term>)`
    returns a context where that term's `ontology_class`/`ontology_uri` are preserved.
  - A term present in `previous` with a non-empty `rejected_ontology_uris` keeps those
    rejections after regeneration.
  - A term that no longer exists in the new snapshot is simply dropped (no crash).
  - `POST /api/context/generate` in `test_api.py` demonstrates the full loop: generate →
    accept (via the real endpoint) → regenerate → alignment still present in the response.
**RED**: `packages/semantic-runtime/tests/test_generate.py` — new test generates a
context, manually sets `ontology_class`/`ontology_uri` on one entry, regenerates via
`generate_context(..., previous=that_ctx)`, asserts the matching term keeps its
alignment and an unrelated term stays `None`. Mutator gaps to guard: boundary on "term
still exists" (dict-key match), and the no-`previous` default (must behave exactly as
today — a mutant that always preserves even without `previous` should be caught by an
existing/adjacent test asserting `ontology_class is None` when `previous=None`).
**GREEN**: Add `previous: Optional[SemanticContext] = None` param to `generate_context()`;
after building `ctx`, if `previous` is given, merge alignment fields by matching
`entry.term` against `{e.term: e for e in previous.glossary}`. Wire `previous=context()`
(the about-to-be-replaced context) at the two real call sites in
`apps/server/polanyi/api/__init__.py` (`/api/context/generate`, and the analogous
regenerate-on-introspect path around line 441).
**MUTATE**: Run `mutation-testing` skill on `generate.py`.
**KILL MUTANTS**: Address survivors; ask if a survivor's value is ambiguous (e.g., is
matching by `term` string good enough, or should it be case-insensitive?).
**REFACTOR**: Assess only if it adds value.
**Done when**: All acceptance criteria met, mutation report reviewed, human approves commit.

### Slice 2: Real dashboard summary cards (Tailwind/shadcn wiring proof)

**Value**: A user opening the Ontology page immediately sees real counts — how many
terms are aligned, need review, were rejected, or are unmapped — without reading four
tables.
**Path**: `OntologyPage` → existing `fetchAlignmentQueue()` (unchanged) → **new**
`AlignmentDashboard` component (shadcn `Card`) rendered above the existing band tables,
computing counts via `groupByBand()` (unchanged) plus an average score.
**Required implementation skills**: `tdd`, `testing`, `mutation-testing`, `refactoring`,
plus `react-testing` / `front-end-testing` for the Vitest browser-mode test.
**Acceptance criteria**:
  - Tailwind + shadcn/ui + lucide-react are installed and configured for `studio-v1`,
    scoped so existing pages' plain CSS is untouched (Tailwind's preflight must not leak
    global resets onto the rest of the app — verify by loading another page and
    confirming its rendered styles are unchanged).
  - Given a queue with known items across all four bands, the dashboard shows the exact
    counts and the exact average score (rounded consistently with existing `.toFixed`
    conventions elsewhere in the codebase).
  - Given an empty queue, the dashboard shows zeros, not `NaN`/`undefined`.
**RED**: `AlignmentDashboard.test.tsx` (vitest browser mode) — render with a fixed
`AlignmentQueue` fixture (2 auto, 1 review, 1 rejected, 1 unmapped, known scores),
assert each card's number via `getByText`. Add a zero-items case. Mutator gaps: off-by-one
in count filters, `+`→`-` in average calc, `/length`→`/ (length+1)`.
**GREEN**: Minimum `AlignmentDashboard.tsx` using shadcn `Card`/`Badge` primitives,
Tailwind classes for layout — no new backend calls, reuses `groupByBand()`.
**MUTATE/KILL MUTANTS/REFACTOR**: as above.
**Done when**: Dashboard renders real counts in the browser against the live backend
(manual check), all criteria met, human approves commit.

### Slice 3: Filterable term list + detail panel replaces the flat band tables

**Value**: A user can search/filter glossary terms, select one, and see/act on its real
current best FIBO candidate in a focused panel — the actual review workflow the flat
4-table layout made tedious.
**Path**: `OntologyPage` state gains `selectedTerm` + `filter`/`search`; new
`AlignmentSidebar`-style term list (left) + detail panel (right) **replace** the four
`BandTable` renders. Detail panel's Accept/Reject buttons call the existing
`acceptAlignment(term)` / `rejectAlignment(term)` (unchanged endpoints/functions) —
this slice is a UI re-wiring of already-tested backend behavior, not new business logic.
**Required implementation skills**: `tdd`, `testing`, `mutation-testing`, `refactoring`,
`react-testing`.
**Acceptance criteria**:
  - Typing in the search box filters the term list to terms whose name (case-insensitive)
    contains the query; clearing it restores the full list.
  - The all/aligned/unaligned filter buttons narrow the list consistently with each
    term's band (`auto` counts as aligned; everything else unaligned).
  - Selecting a term shows its definition, source tables/columns, and its current best
    candidate (label, URI, score) — or an honest "no candidate found" state if none.
  - Clicking Accept/Reject calls the real endpoint and the panel reflects the
    server-returned queue (term moves band, per existing endpoint contract).
  - No graph canvas, no rationale text, no multi-candidate list yet (later slices).
**RED**: Browser-mode tests for search filtering, band filtering, empty-selection state,
and accept/reject wiring (MSW-mocked `/api/context/align/*`, same pattern as
`SourcesPage.test.tsx`). Mutator gaps: filter predicate inversions, `includes` vs
`startsWith` on search, band-membership boundary for "aligned".
**GREEN**: Minimum list/detail components, delete the now-superseded `BandTable`
rendering from `OntologyPage.tsx` (keep `groupByBand`/`alignmentBands.ts` — still used
for filtering).
**Done when**: All criteria met, mutation report reviewed, human approves commit.

### Slice 4: Real match rationale shown per candidate

**Value**: A user deciding whether to accept a candidate sees *why* it scored what it
did (e.g., "singular match; boosted for 12 subclasses"), not just a bare number —
builds trust without inventing an explanation.
**Path**: `ontology.py` `search_classes()` → refactor `score_label()`'s decision into a
function that also returns which rule fired (exact/singular/prefix/contains/none),
combine with the structural boost/penalty already computed, produce a plain-English
`rationale` string → new `AlignmentReviewItem.rationale: Optional[str]` field →
`alignment_queue()` populates it for the best candidate → frontend detail panel renders it.
**Required implementation skills**: `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Acceptance criteria**:
  - `score_label`-derived rationale correctly names the matching rule for each of the
    four real cases (exact/singular/prefix-or-substring/containment) plus "no match".
  - The structural boost/penalty is reflected in the rationale text when it applied
    (e.g., mentions subclass count) and omitted when it didn't.
  - `AlignmentReviewItem.rationale` is `None` only when there's no candidate at all.
  - Existing `test_ontology.py` alignment tests still pass unchanged (rationale is
    additive, not a breaking schema change).
**RED**: `test_ontology.py` — unit tests for the new rationale function covering all
five real branches; one `alignment_queue()` test asserting rationale text appears.
Mutator gaps: string-branch conditionals collapsing (e.g., singular and prefix branches
merged), boost-mentioned-when-not-applied.
**GREEN**: Minimum rationale builder, wired through `AlignmentReviewItem` and the Zod
schema in `apps/studio-v1/src/api/ontology.ts`.
**Done when**: Criteria met, mutation report reviewed, human approves commit.

### Slice 5: Top-N real candidates per term, accept a specific one

**Value**: When more than one FIBO class plausibly matches a term, a user sees all of
them (not just the algorithm's top pick) and can accept the one that's actually correct.
**Path**: `alignment_queue()` returns up to 3 real candidates per term (already computed
by `search_classes()`, currently discarded past the best) via new `AlignmentCandidate`
list; `accept_alignment(context, term, store, candidate_uri: Optional[str] = None)`
accepts the specified candidate (falls back to best when omitted, preserving current
behavior/tests); `POST /api/context/align/{term}/accept` accepts an optional JSON body
`{"candidate_uri": ...}`.
**Required implementation skills**: `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Acceptance criteria**:
  - `alignment_queue()` item exposes `candidates: list[AlignmentCandidate]` (uri, label,
    score, rationale), ordered by score descending, capped at 3.
  - Accepting with an explicit `candidate_uri` persists exactly that candidate's
    label/uri, even when it isn't the top-scored one.
  - Accepting with no body behaves exactly as today (top candidate).
  - Existing single-candidate accept tests in `test_api.py`/`test_ontology.py` pass
    unchanged (backward-compatible default).
**RED**: `test_ontology.py` for `accept_alignment(..., candidate_uri=...)` picking a
non-top candidate and raising `LookupError` for an unknown uri; `test_api.py` for the
endpoint accepting a body. Mutator gaps: candidate-cap off-by-one, "unknown uri" branch
skipped silently instead of raising.
**GREEN**: Extend models/endpoint/frontend `AlignmentCandidate` list rendered in the
Slice 3 detail panel (each candidate gets its own Accept/Reject).
**Done when**: Criteria met, mutation report reviewed, human approves commit.

### Slice 6: Node-link graph canvas of real topology

**Value**: A user gets a visual overview of alignment coverage — which terms are linked
to which FIBO classes and which stand alone — and can click a node to jump straight to
its detail panel.
**Path**: Purely a frontend consumer of the existing `/api/context/align/queue` data
(no backend change) — build graph nodes/edges client-side from real queue items (one
node per term, one node per distinct linked FIBO class, one edge per term→candidate),
positioned by a **deterministic, unit-tested layout function** (e.g., two columns —
FIBO classes left, terms right — sorted and spaced arithmetically), not a physics
simulation. Edge styling (solid/dashed, color) reflects the real `band`. Selecting a
node updates the same `selectedTerm` state from Slice 3.
**Required implementation skills**: `tdd`, `testing`, `mutation-testing`, `refactoring`,
`react-testing`.
**Acceptance criteria**:
  - Given a fixed queue fixture, the layout function returns the same coordinates every
    run (pure function, no randomness) — unit-tested directly.
  - Every rendered edge corresponds to a real `AlignmentReviewItem` with a non-null
    `candidate_uri`; unmapped terms render as unconnected nodes, not fabricated edges.
  - Clicking a term node selects it in the sidebar detail panel (and vice versa —
    selecting in the list highlights its node).
  - No candidate score, method, or relation type is invented for the graph that isn't
    already present in the real data.
**RED**: Pure-function tests for the layout algorithm (coordinates, ordering, spacing
edge cases: 0 nodes, 1 node, ties). Browser-mode test for click-to-select sync in both
directions. Mutator gaps: coordinate arithmetic off-by-one, edge-inclusion predicate
inverted (would draw edges for unmapped terms).
**GREEN**: `OntologyGraph.tsx` (SVG, following the sample's marker/line approach but
fed real data + deterministic layout), wired into `OntologyPage`.
**Done when**: Criteria met, mutation report reviewed, human approves commit.

### Slice 7 (stretch, optional): Bulk-accept review-band terms above a threshold

**Value**: A user with many high-scoring "needs review" terms accepts them all at once
instead of one at a time.
**Path**: Dashboard gains a confidence-threshold slider (shadcn `Slider`) + "Accept all
above threshold" button; on click, sequentially calls the real `acceptAlignment(term)`
for every review-band item with `score >= threshold` (real calls, not simulated), then
refreshes the queue.
**Required implementation skills**: `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Acceptance criteria**:
  - Only review-band items at/above the threshold are accepted; items below it, and
    items in other bands, are untouched.
  - If one accept call fails mid-batch, the UI reports which terms succeeded vs. failed
    (no silent partial failure).
**RED/GREEN/MUTATE/KILL MUTANTS/REFACTOR**: standard cycle.
**Done when**: Criteria met, mutation report reviewed, human approves commit. This slice
can be dropped without affecting Slices 1–6.

## Pre-PR Quality Gate

Before each PR:
1. Mutation testing — run `mutation-testing` skill
2. Refactoring assessment — run `refactoring` skill
3. `tsc --noEmit` (frontend) / typecheck clean, backend tests pass (`pytest`)
4. Manual live-browser check against the real backend (GraphDB + FastAPI running) —
   this feature is explicitly about honesty of real data, so a passing test suite alone
   doesn't close a slice; confirm the rendered numbers match a direct API call.

---
*Delete this file when the plan is complete. If `plans/` is empty, delete the directory.*
