from graphos.models import GlossaryEntry, SemanticContext
from graphos.semantic.ontology import (
    OntologyCandidate,
    align_glossary,
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
    def __init__(self, candidates_by_term):
        self.candidates_by_term = candidates_by_term
        self.queries = []

    def search_classes(self, term, limit=5):
        self.queries.append(term)
        return self.candidates_by_term.get(term.lower(), [])


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
