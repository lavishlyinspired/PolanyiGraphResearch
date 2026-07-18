# S8 / S8b — Ontology · FIBO alignment review queue

**Status:** S8 DONE · S8b NEXT
**Plan basis:** `way-forward-plan.md` §5 Phase 1. Prototype page: `#ontology` in
`polanyi-studio-prototype.html` (3-band queue + hierarchy/reasoning panel).

## What's real vs. what would be fabricated

Verified by reading `packages/semantic-runtime/semantic/ontology.py`:

- **Real, derivable:** every glossary term's best ontology candidate + its lexical **score** comes
  from `store.search_classes(term)` (deterministic `score_label`, boosted by subclass count). The
  band boundaries are already in the code: `_MIN_ALIGNMENT_SCORE = 0.9` (auto-attach threshold) and
  a hardcoded `0.5` floor in `align_glossary` (the LLM-plausibility floor). So the 3 **score-derived**
  bands are honest data:
  - **auto** — score ≥ 0.90 (attaches automatically, `skos:exactMatch`)
  - **review** — 0.50 ≤ score < 0.90 (a human decides)
  - **unmapped** — score < 0.50 or no candidate at all
- **NOT real (deferred):** the prototype's **"Rejected · precision-first"** band is a *persisted human
  decision*, not a score band. There is no decision store today. It belongs to **S8b** (the write
  action). S8 surfaces only the three score-derived bands — no fabricated "rejected" rows, no
  invented reasoning prose (the prototype's "must not silently become revenue bond" narration has no
  backend; we show the real score + threshold instead).
- **NOT real (descoped from this story):** the "Hierarchy & reasoning" panel (HermiT consistency,
  ancestors walk). `expand_subclasses` exists but OWL reasoning/HermiT wiring does not — descope,
  revisit as its own story.

## S8 — read-only queue

### Backend

New in `packages/common/models.py`:
```python
AlignmentBand = Literal["auto", "review", "unmapped"]

class AlignmentReviewItem(BaseModel):
    term: str
    band: AlignmentBand
    candidate_label: Optional[str] = None
    candidate_uri: Optional[str] = None
    score: float = Field(default=0.0, ge=0.0, le=1.0)

class AlignmentQueue(BaseModel):
    items: list[AlignmentReviewItem] = Field(default_factory=list)
```

New in `ontology.py`:
- `_MIN_REVIEW_SCORE = 0.5` — extracted constant, reused by `align_glossary`'s existing `>= 0.5`
  (DRY: same knowledge — "below 0.5 a candidate is too imprecise to consider").
- `classify_band(score: Optional[float]) -> AlignmentBand` — pure, boundary-sensitive (the
  mutation-critical function). Boundary tests pin 0.90, 0.89, 0.50, 0.49, None, 1.0.
- `alignment_queue(context, store) -> AlignmentQueue` — orchestrates: best candidate per term →
  band. Mirrors `align_glossary`'s structure; tested with the existing `FakeStore` double (an
  injected Protocol boundary, not the function under test — legitimate).

New endpoint `GET /api/context/align/queue` — guarded by `graphdb_configured()` +
`store.is_available()` (503 otherwise), like the existing `POST /api/context/align`. Test via the
`test_api.py` monkeypatch-the-store precedent.

**TDD:** RED-GREEN on `classify_band` (boundaries) → MANUAL MUTATE (Python has no Stryker here:
mutate `>= 0.9`→`> 0.9`, `< 0.5`→`<= 0.5`, `is None` removal; confirm each boundary test kills it) →
`alignment_queue` behavior test → endpoint test.

### Frontend

New `apps/studio-v1/src/pages/Ontology/OntologyPage.tsx` + `src/api/ontology.ts` (Zod mirror). Three
grouped `.panel`+`.tbl` sections (Needs review / Auto-aligned / Unmapped), matching the prototype's
band tables (term · candidate `code` · score · band chip). New "Ontology · FIBO" nav item in the
**Govern** group of `AppShell` (matches prototype order: Semantic Model, Business Rules, Ontology,
Validator). Honest empty/loading states (the page depends on GraphDB — show a clear "requires
GraphDB" state on 503 rather than hanging).

## S8b — accept / reject one candidate (write, two sub-slices)

**Design refinement discovered planning S8b:** for Accept to be *observable* (the vertical-slice
requirement), `alignment_queue` must honor persisted state, not just live scores. Refined precedence
per term: **persisted `ontology_uri` set → "auto"/aligned band** (reflect the decision); else classify
by live best-candidate score (review / unmapped). This makes the queue a real review surface (a term
you align stays aligned) rather than a stateless preview. Backward-compatible with S8's tests (their
fixtures have `ontology_uri=None`). The "auto" band is relabelled **"Aligned"** with hint
"published · skos:exactMatch" — dropping the "≥ 0.90" claim, since a human can accept a sub-0.90
candidate.

### Sub-slice A — Accept
- `alignment_queue` honors persisted `ontology_uri` (aligned → "auto"; score re-derived by matching
  the persisted uri in live candidates, 0.0 if it drifted out — an honest drift signal).
- `accept_alignment(context, term, store)` — re-runs `search_classes` server-side and attaches the
  **best** candidate (client can't inject an arbitrary uri — preserves "pick only from retrieved").
  Raises `LookupError` for unknown term / no candidate.
- `POST /api/context/align/{term}/accept` → saves context, returns updated queue. 404 on LookupError.
- Frontend: Accept button on review rows → POST → refetch queue (term moves to Aligned band).

### Sub-slice B — Reject
- New `GlossaryEntry.rejected_ontology_uris: list[str]` + new `"rejected"` band.
- `alignment_queue`: a term whose best candidate uri is in its rejected list → "rejected" band.
- `reject_alignment(context, term, store)` records the best candidate's uri (and clears
  `ontology_uri` if it matched). `POST …/{term}/reject`.
- Frontend: Reject button; a "Rejected" band table appears (the prototype's "Rejected · precision-first"
  becomes real, backed by persisted decisions — not fabricated).

## Baseline before S8
53/53 studio-v1 tests, 119/119 Python tests, typecheck clean.

## S8 results (DONE)

- **Backend:** `classify_band` + `alignment_queue` + 3 models + `_MIN_REVIEW_SCORE` (DRY). RED-GREEN,
  then MANUAL MUTATE — 5 mutants (`>=0.9`→`>0.9`, `<0.5`→`<=0.5`, drop `is None` guard, `max`→`min`,
  score default `0.0`→`1.0`), **all killed**. *Gotcha logged:* Python caches bytecode — clear
  `__pycache__` between manual mutations or a reverted file can appear to still fail (cost ~10 min of
  confusion mid-slice; the code was never actually broken).
- **Endpoint:** `GET /api/context/align/queue`, 3 tests (200 with mixed bands via monkeypatched
  store; 503 unconfigured; 503 configured-but-unreachable — the last closes the `is_available` guard
  mutation gap that the existing `align_context` endpoint leaves open).
- **Frontend:** `api/ontology.ts` (+ `GraphDBUnavailableError`), `alignmentBands.ts` **100% Stryker
  (20/20)**, `OntologyPage.tsx` (3 band tables + degraded/error states), 3 browser tests + 1 AppShell
  nav test (button-role, aria-current — manual mutant killed).
- **Live verification:** restarted the stale local uvicorn to load the new route, confirmed a real
  `503 GRAPHDB_ENDPOINT not configured` renders the honest "requires GraphDB" state in Chrome (not a
  fake empty queue). Populated 3-band view covered by the browser tests (GraphDB not running locally).
- **Totals:** 60/60 studio-v1, 128/128 Python, typecheck clean, 0 regressions.
