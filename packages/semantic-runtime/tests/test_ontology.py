from polanyi.models import GlossaryEntry, SemanticContext
import pytest

from polanyi.semantic.ontology import (
    OntologyCandidate,
    accept_alignment,
    align_glossary,
    alignment_queue,
    classify_band,
    reject_alignment,
    score_label,
)


def test_score_exact_label_match_is_highest():
    assert score_label("Trade", "trade") == 1.0


def test_score_singular_plural_variants_rank_close_to_exact():
    assert score_label("Trades", "trade") >= 0.9
    assert score_label("Counterparty", "counterparties") >= 0.9


def test_score_prefix_beats_substring_beats_miss():
    prefix = score_label("Trade Date", "trade date value")
    substring = score_label("Trade", "equity trade confirmation")
    miss = score_label("Trade", "interest rate")
    assert prefix > substring > miss
    assert miss == 0.0


class FakeStore:
    def __init__(self, candidates_by_term, hierarchy=None):
        self.candidates_by_term = candidates_by_term
        self.hierarchy = hierarchy or {}
        self.queries = []

    def search_classes(self, term, limit=5):
        self.queries.append(term)
        return self.candidates_by_term.get(term.lower(), [])

    def class_hierarchy(self, class_uri):
        return self.hierarchy.get(class_uri, ([], []))


def make_context():
    return SemanticContext(
        domain="Financial Services",
        glossary=[
            GlossaryEntry(
                term="Notional Amount",
                definition="Total value of a trade",
                source_tables=["trades"],
                source_columns=["notional_amount"],
            ),
            GlossaryEntry(
                term="Zzz Unmatched",
                definition="No ontology equivalent",
                source_tables=["daily_pnl"],
                source_columns=["zzz"],
            ),
        ],
    )


def test_align_glossary_attaches_best_candidate():
    store = FakeStore(
        {
            "notional amount": [
                OntologyCandidate(
                    uri="https://spec.edmcouncil.org/fibo/ontology/ND/Amount",
                    label="notional amount",
                    score=1.0,
                ),
                OntologyCandidate(
                    uri="https://spec.edmcouncil.org/fibo/ontology/ND/Other",
                    label="notional amount leg",
                    score=0.7,
                ),
            ]
        }
    )
    ctx = align_glossary(make_context(), store)
    entry = next(g for g in ctx.glossary if g.term == "Notional Amount")
    assert entry.ontology_uri == "https://spec.edmcouncil.org/fibo/ontology/ND/Amount"
    assert entry.ontology_class == "notional amount"


def test_align_glossary_leaves_unmatched_terms_untouched():
    ctx = align_glossary(make_context(), FakeStore({}))
    entry = next(g for g in ctx.glossary if g.term == "Zzz Unmatched")
    assert entry.ontology_uri is None
    assert entry.ontology_class is None


def test_align_glossary_ignores_weak_candidates():
    store = FakeStore(
        {
            "notional amount": [
                OntologyCandidate(uri="urn:weak", label="completely different", score=0.1)
            ]
        }
    )
    ctx = align_glossary(make_context(), store)
    entry = next(g for g in ctx.glossary if g.term == "Notional Amount")
    assert entry.ontology_uri is None


def test_align_glossary_rejects_prefix_only_matches():
    """'Revenue' must not auto-align to 'revenue bond' — a narrower concept.
    Prefix hits are fine for search ranking but too imprecise to attach."""
    store = FakeStore(
        {
            "notional amount": [
                OntologyCandidate(uri="urn:fibo:NotionalStep", label="notional step", score=0.7)
            ]
        }
    )
    ctx = align_glossary(make_context(), store)
    entry = next(g for g in ctx.glossary if g.term == "Notional Amount")
    assert entry.ontology_uri is None


def test_align_glossary_clears_stale_alignment_when_no_longer_confident():
    ctx = make_context()
    ctx.glossary[0].ontology_class = "revenue bond"
    ctx.glossary[0].ontology_uri = "urn:stale"
    realigned = align_glossary(ctx, FakeStore({}))
    entry = next(g for g in realigned.glossary if g.term == "Notional Amount")
    assert entry.ontology_uri is None
    assert entry.ontology_class is None


class FakeRankingLLM:
    """Structured-output stub that always chooses the given URI."""

    def __init__(self, chosen_uri):
        self.chosen_uri = chosen_uri

    def with_structured_output(self, schema):
        outer = self

        class Runner:
            def invoke(self, _prompt):
                return schema(chosen_uri=outer.chosen_uri)

        return Runner()


AMBIGUOUS = {
    "notional amount": [
        OntologyCandidate(uri="urn:fibo:NotionalAmount", label="notional amount leg", score=0.7),
        OntologyCandidate(uri="urn:fibo:NotionalStep", label="notional step", score=0.5),
    ]
}


class CapturingRankingLLM:
    """Structured-output stub that records the rendered prompt for inspection."""

    def __init__(self, chosen_uri):
        self.chosen_uri = chosen_uri
        self.captured_prompt = None

    def with_structured_output(self, schema):
        outer = self

        class Runner:
            def invoke(self, prompt):
                outer.captured_prompt = prompt
                return schema(chosen_uri=outer.chosen_uri)

        return Runner()


def test_llm_ranking_prompt_includes_real_fibo_parent_and_children_labels():
    store = FakeStore(
        AMBIGUOUS,
        hierarchy={"urn:fibo:NotionalAmount": (["MonetaryAmount"], ["NotionalAmountLeg"])},
    )
    llm = CapturingRankingLLM("urn:fibo:NotionalAmount")
    align_glossary(make_context(), store, llm=llm)
    assert "MonetaryAmount" in llm.captured_prompt
    assert "NotionalAmountLeg" in llm.captured_prompt


def test_llm_ranking_prompt_omits_structure_for_a_candidate_with_no_parent_or_children():
    """A root class (no parent) or leaf class (no children) must render without
    crashing and without inventing placeholder structure."""
    store = FakeStore(AMBIGUOUS)  # no `hierarchy` given -> every candidate is bare
    llm = CapturingRankingLLM("urn:fibo:NotionalAmount")
    align_glossary(make_context(), store, llm=llm)
    assert "parent" not in llm.captured_prompt.lower()
    assert "children" not in llm.captured_prompt.lower()


def test_llm_ranks_ambiguous_candidates_from_retrieved_list():
    ctx = align_glossary(
        make_context(), FakeStore(AMBIGUOUS), llm=FakeRankingLLM("urn:fibo:NotionalAmount")
    )
    entry = next(g for g in ctx.glossary if g.term == "Notional Amount")
    assert entry.ontology_uri == "urn:fibo:NotionalAmount"


def test_llm_cannot_invent_uris_outside_the_candidate_list():
    ctx = align_glossary(
        make_context(), FakeStore(AMBIGUOUS), llm=FakeRankingLLM("urn:made:up")
    )
    entry = next(g for g in ctx.glossary if g.term == "Notional Amount")
    assert entry.ontology_uri is None


def test_llm_can_decline_to_align():
    ctx = align_glossary(make_context(), FakeStore(AMBIGUOUS), llm=FakeRankingLLM(None))
    entry = next(g for g in ctx.glossary if g.term == "Notional Amount")
    assert entry.ontology_uri is None


# ── Alignment review queue (classify_band + alignment_queue) ─────


def test_classify_band_auto_at_and_above_the_auto_threshold():
    assert classify_band(0.90) == "auto"
    assert classify_band(1.0) == "auto"


def test_classify_band_review_between_the_floor_and_the_auto_threshold():
    assert classify_band(0.89) == "review"
    assert classify_band(0.50) == "review"


def test_classify_band_unmapped_below_the_review_floor_or_when_no_candidate():
    assert classify_band(0.49) == "unmapped"
    assert classify_band(0.0) == "unmapped"
    assert classify_band(None) == "unmapped"


def test_alignment_queue_buckets_each_glossary_term_by_best_candidate_score():
    store = FakeStore(
        {
            "notional amount": [
                OntologyCandidate(uri="urn:fibo:NotionalAmount", label="notional amount", score=0.97),
                OntologyCandidate(uri="urn:fibo:Other", label="notional amount leg", score=0.7),
            ],
        }
    )
    queue = alignment_queue(make_context(), store)

    by_term = {item.term: item for item in queue.items}
    assert by_term["Notional Amount"].band == "auto"
    assert by_term["Notional Amount"].candidate_uri == "urn:fibo:NotionalAmount"
    assert by_term["Notional Amount"].candidate_label == "notional amount"
    assert by_term["Notional Amount"].score == 0.97
    # A term the store returns nothing for is unmapped with no candidate.
    assert by_term["Zzz Unmatched"].band == "unmapped"
    assert by_term["Zzz Unmatched"].candidate_uri is None
    assert by_term["Zzz Unmatched"].score == 0.0


def test_alignment_queue_reports_every_glossary_term_once():
    queue = alignment_queue(make_context(), FakeStore({}))
    assert [item.term for item in queue.items] == ["Notional Amount", "Zzz Unmatched"]


def test_alignment_queue_places_mid_confidence_candidate_in_review_band():
    store = FakeStore(
        {
            "notional amount": [
                OntologyCandidate(uri="urn:fibo:NotionalStep", label="notional step", score=0.7),
            ],
        }
    )
    queue = alignment_queue(make_context(), store)
    item = next(i for i in queue.items if i.term == "Notional Amount")
    assert item.band == "review"
    assert item.candidate_uri == "urn:fibo:NotionalStep"
    assert item.score == 0.7


def test_alignment_queue_reflects_a_persisted_alignment_as_aligned_despite_a_low_live_score():
    """A term a human accepted stays in the 'auto' (aligned) band even though its
    live candidate would otherwise be mere 'review' — the queue honors decisions."""
    ctx = make_context()
    entry = next(e for e in ctx.glossary if e.term == "Notional Amount")
    entry.ontology_class = "notional step"
    entry.ontology_uri = "urn:fibo:NotionalStep"
    store = FakeStore(
        {
            "notional amount": [
                OntologyCandidate(uri="urn:fibo:NotionalStep", label="notional step", score=0.61),
            ],
        }
    )
    item = next(i for i in alignment_queue(ctx, store).items if i.term == "Notional Amount")
    assert item.band == "auto"
    assert item.candidate_uri == "urn:fibo:NotionalStep"
    # Score re-derived from the matching live candidate.
    assert item.score == 0.61


def test_alignment_queue_review_band_shows_llm_ranked_candidate_over_raw_top_score():
    """The queue is what a human reviews before deciding — when an LLM is
    configured, it should show the LLM's actual pick among real candidates,
    not always the naive top lexical score."""
    queue = alignment_queue(
        make_context(), FakeStore(AMBIGUOUS), llm=FakeRankingLLM("urn:fibo:NotionalStep")
    )
    item = next(i for i in queue.items if i.term == "Notional Amount")
    assert item.band == "review"
    assert item.candidate_uri == "urn:fibo:NotionalStep"
    assert item.candidate_label == "notional step"
    assert item.score == 0.5


def test_alignment_queue_review_band_keeps_raw_top_candidate_when_llm_declines():
    queue = alignment_queue(make_context(), FakeStore(AMBIGUOUS), llm=FakeRankingLLM(None))
    item = next(i for i in queue.items if i.term == "Notional Amount")
    assert item.band == "review"
    assert item.candidate_uri == "urn:fibo:NotionalAmount"
    assert item.score == 0.7


def test_alignment_queue_auto_band_ignores_llm_ranking():
    """Ranking only ever applies inside the review band — an already-confident
    (>=0.90) candidate must never be swapped out by the LLM."""
    store = FakeStore(
        {
            "notional amount": [
                OntologyCandidate(uri="urn:fibo:NotionalAmount", label="notional amount", score=0.97),
            ],
        }
    )
    queue = alignment_queue(make_context(), store, llm=FakeRankingLLM("urn:some:other"))
    item = next(i for i in queue.items if i.term == "Notional Amount")
    assert item.band == "auto"
    assert item.candidate_uri == "urn:fibo:NotionalAmount"


def test_alignment_queue_rejected_band_ignores_llm_ranking():
    """Ranking only ever applies inside the review band — a rejected term's
    displayed candidate must not change just because an LLM is configured."""
    store = FakeStore(
        {
            "notional amount": [
                OntologyCandidate(uri="urn:fibo:NotionalStep", label="notional step", score=0.61),
            ],
        }
    )
    ctx = make_context()
    entry = next(e for e in ctx.glossary if e.term == "Notional Amount")
    entry.rejected_ontology_uris = ["urn:fibo:NotionalStep"]

    queue = alignment_queue(ctx, store, llm=FakeRankingLLM("urn:some:other"))
    item = next(i for i in queue.items if i.term == "Notional Amount")
    assert item.band == "rejected"
    assert item.candidate_uri == "urn:fibo:NotionalStep"


def test_alignment_queue_scores_a_drifted_persisted_alignment_as_zero():
    """A persisted alignment whose URI no longer appears among live candidates
    scores 0.0 — an honest signal that the ontology drifted out from under it."""
    ctx = make_context()
    entry = next(e for e in ctx.glossary if e.term == "Notional Amount")
    entry.ontology_class = "notional amount"
    entry.ontology_uri = "urn:fibo:GoneAway"
    store = FakeStore(
        {
            "notional amount": [
                OntologyCandidate(uri="urn:fibo:SomethingElse", label="something else", score=0.8),
            ],
        }
    )
    item = next(i for i in alignment_queue(ctx, store).items if i.term == "Notional Amount")
    assert item.band == "auto"
    assert item.candidate_uri == "urn:fibo:GoneAway"
    assert item.score == 0.0


# ── accept_alignment (write) ─────────────────────────────────────


def test_accept_alignment_attaches_the_best_candidate_to_the_term():
    store = FakeStore(
        {
            "notional amount": [
                OntologyCandidate(uri="urn:fibo:NotionalAmount", label="notional amount", score=0.61),
                OntologyCandidate(uri="urn:fibo:Other", label="notional other", score=0.55),
            ],
        }
    )
    ctx = accept_alignment(make_context(), "Notional Amount", store)
    entry = next(e for e in ctx.glossary if e.term == "Notional Amount")
    assert entry.ontology_uri == "urn:fibo:NotionalAmount"
    assert entry.ontology_class == "notional amount"


def test_accept_alignment_raises_for_an_unknown_term():
    with pytest.raises(LookupError):
        accept_alignment(make_context(), "No Such Term", FakeStore({}))


def test_accept_alignment_raises_when_the_term_has_no_candidate():
    with pytest.raises(LookupError):
        accept_alignment(make_context(), "Notional Amount", FakeStore({}))


def test_accept_alignment_raises_when_no_candidate_even_with_llm_configured():
    with pytest.raises(LookupError):
        accept_alignment(
            make_context(), "Notional Amount", FakeStore({}), llm=FakeRankingLLM(None)
        )


def test_accept_alignment_does_not_let_llm_override_a_high_confidence_candidate():
    """A term with a clear (>=0.90) lexical match is never re-ranked — matches
    align_glossary's existing rule that the LLM only ranks ambiguous cases."""
    store = FakeStore(
        {
            "notional amount": [
                OntologyCandidate(uri="urn:fibo:NotionalAmount", label="notional amount", score=0.97),
                OntologyCandidate(uri="urn:fibo:Other", label="notional other", score=0.6),
            ],
        }
    )
    ctx = accept_alignment(
        make_context(), "Notional Amount", store, llm=FakeRankingLLM("urn:fibo:Other")
    )
    entry = next(e for e in ctx.glossary if e.term == "Notional Amount")
    assert entry.ontology_uri == "urn:fibo:NotionalAmount"


def test_accept_alignment_persists_the_same_llm_ranked_candidate_the_queue_displayed():
    """A user reviews whatever the queue shows, then clicks Accept — accept must
    never silently re-derive a different candidate than the one just reviewed."""
    store = FakeStore(AMBIGUOUS)
    llm = FakeRankingLLM("urn:fibo:NotionalStep")

    queue = alignment_queue(make_context(), store, llm=llm)
    displayed = next(i for i in queue.items if i.term == "Notional Amount")
    assert displayed.candidate_uri == "urn:fibo:NotionalStep"  # sanity: LLM pick, not raw top

    ctx = accept_alignment(make_context(), "Notional Amount", store, llm=llm)
    entry = next(e for e in ctx.glossary if e.term == "Notional Amount")
    assert entry.ontology_uri == displayed.candidate_uri
    assert entry.ontology_class == displayed.candidate_label


# ── reject_alignment + rejected band ─────────────────────────────

REVIEW_STORE = FakeStore(
    {
        "notional amount": [
            OntologyCandidate(uri="urn:fibo:NotionalStep", label="notional step", score=0.61),
        ],
    }
)


def test_alignment_queue_puts_a_term_with_a_rejected_best_candidate_in_the_rejected_band():
    ctx = make_context()
    entry = next(e for e in ctx.glossary if e.term == "Notional Amount")
    entry.rejected_ontology_uris = ["urn:fibo:NotionalStep"]
    item = next(i for i in alignment_queue(ctx, REVIEW_STORE).items if i.term == "Notional Amount")
    assert item.band == "rejected"
    assert item.candidate_uri == "urn:fibo:NotionalStep"


def test_alignment_queue_prefers_a_persisted_alignment_over_a_rejected_candidate():
    """Aligned wins: a term aligned to one class is not dragged into 'rejected'
    just because a different candidate was rejected earlier."""
    ctx = make_context()
    entry = next(e for e in ctx.glossary if e.term == "Notional Amount")
    entry.ontology_uri = "urn:fibo:Accepted"
    entry.ontology_class = "accepted class"
    entry.rejected_ontology_uris = ["urn:fibo:NotionalStep"]
    item = next(i for i in alignment_queue(ctx, REVIEW_STORE).items if i.term == "Notional Amount")
    assert item.band == "auto"
    assert item.candidate_uri == "urn:fibo:Accepted"


def test_reject_alignment_records_the_best_candidate_uri():
    ctx = reject_alignment(make_context(), "Notional Amount", REVIEW_STORE)
    entry = next(e for e in ctx.glossary if e.term == "Notional Amount")
    assert "urn:fibo:NotionalStep" in entry.rejected_ontology_uris


def test_reject_alignment_clears_a_persisted_alignment_when_it_matches_the_rejected_uri():
    ctx = make_context()
    entry = next(e for e in ctx.glossary if e.term == "Notional Amount")
    entry.ontology_uri = "urn:fibo:NotionalStep"
    entry.ontology_class = "notional step"
    rejected = reject_alignment(ctx, "Notional Amount", REVIEW_STORE)
    updated = next(e for e in rejected.glossary if e.term == "Notional Amount")
    assert updated.ontology_uri is None
    assert updated.ontology_class is None
    assert "urn:fibo:NotionalStep" in updated.rejected_ontology_uris


def test_reject_alignment_raises_for_an_unknown_term():
    with pytest.raises(LookupError):
        reject_alignment(make_context(), "No Such Term", REVIEW_STORE)


def test_reject_alignment_records_the_llm_ranked_candidate_the_queue_displayed():
    """Symmetric with accept: reject must record the URI the user actually saw
    and rejected, not a re-derived raw-top-lexical one."""
    store = FakeStore(AMBIGUOUS)
    llm = FakeRankingLLM("urn:fibo:NotionalStep")

    ctx = reject_alignment(make_context(), "Notional Amount", store, llm=llm)
    entry = next(e for e in ctx.glossary if e.term == "Notional Amount")
    assert entry.rejected_ontology_uris == ["urn:fibo:NotionalStep"]


# ── GraphDBOntologyStore.sparql_query ───────────────────────────


def test_sparql_query_flattens_bindings_to_plain_dicts(monkeypatch):
    from polanyi.semantic.ontology import GraphDBOntologyStore

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {
                "results": {
                    "bindings": [
                        {"term": {"value": "Counterparty"}, "fiboClass": {"value": "fibo:Counterparty"}},
                        {"term": {"value": "Currency"}, "fiboClass": {"value": "fibo:Currency"}},
                    ]
                }
            }

    captured = {}

    def fake_post(url, data, headers, timeout):
        captured["url"] = url
        captured["query"] = data["query"]
        return FakeResponse()

    monkeypatch.setattr("httpx.post", fake_post)

    store = GraphDBOntologyStore(endpoint="http://localhost:7200", repository="fibo")
    rows = store.sparql_query("SELECT ?term ?fiboClass WHERE { ... }")

    assert rows == [
        {"term": "Counterparty", "fiboClass": "fibo:Counterparty"},
        {"term": "Currency", "fiboClass": "fibo:Currency"},
    ]
    assert captured["url"] == "http://localhost:7200/repositories/fibo"
    assert "SELECT ?term" in captured["query"]


def test_class_hierarchy_splits_parent_and_children_labels_by_kind(monkeypatch):
    from polanyi.semantic.ontology import GraphDBOntologyStore

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {
                "results": {
                    "bindings": [
                        {"kind": {"value": "parent"}, "label": {"value": "MonetaryAmount"}},
                        {"kind": {"value": "child"}, "label": {"value": "NotionalAmountLeg"}},
                        {"kind": {"value": "child"}, "label": {"value": "NotionalStep"}},
                    ]
                }
            }

    monkeypatch.setattr("httpx.post", lambda *a, **k: FakeResponse())

    store = GraphDBOntologyStore(endpoint="http://localhost:7200", repository="fibo")
    parents, children = store.class_hierarchy("urn:fibo:NotionalAmount")

    assert parents == ["MonetaryAmount"]
    assert children == ["NotionalAmountLeg", "NotionalStep"]


def test_class_hierarchy_returns_empty_lists_for_a_root_and_leaf_class(monkeypatch):
    from polanyi.semantic.ontology import GraphDBOntologyStore

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"results": {"bindings": []}}

    monkeypatch.setattr("httpx.post", lambda *a, **k: FakeResponse())

    store = GraphDBOntologyStore(endpoint="http://localhost:7200", repository="fibo")
    parents, children = store.class_hierarchy("urn:fibo:Root")

    assert parents == []
    assert children == []
