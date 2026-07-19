"""Real spaCy NER over compliance-flag/investment-policy free text --
optional like every other heavy dependency in this project (embeddings,
GDS, GraphRAG): degrades honestly when spaCy or its model isn't
installed, never fabricates an entity that wasn't actually extracted."""

import pytest

from polanyi.semantic.nlp import (
    audit_compliance_narrative,
    extract_flag_entities,
    parse_stated_percentage,
    resolve_nlp_model,
    spacy_available,
)

REAL_FORD_FLAG_TEXT = (
    "Ford Motor Credit 8% 2028 is rated BB+ (high-yield). Combined "
    "cross-portfolio exposure is 2.1% of AUM, within 3% single-issuer cap "
    "but approaching limit."
)

REAL_CARNIVAL_FLAG_TEXT = "Carnival Corp 5.875% 2027 is rated BB- (high-yield). 3.0% of HY fund AUM."


class FakeEntity:
    def __init__(self, text, label):
        self.text = text
        self.label_ = label


class FakeDoc:
    def __init__(self, ents):
        self.ents = ents


class FakeNlp:
    """Stands in for a loaded spaCy Language object -- injected so most
    tests don't pay the real model's load/inference cost."""

    def __init__(self, ents):
        self._ents = ents

    def __call__(self, text):
        return FakeDoc(self._ents)


# ── parse_stated_percentage (pure) ───────────────────────────────


def test_parse_stated_percentage_converts_percent_string_to_a_fraction():
    assert parse_stated_percentage("2.1%") == pytest.approx(0.021)


def test_parse_stated_percentage_handles_whole_numbers():
    assert parse_stated_percentage("10%") == pytest.approx(0.10)


def test_parse_stated_percentage_returns_none_for_non_percentage_text():
    assert parse_stated_percentage("Risk Committee") is None


# ── extract_flag_entities (given an injected nlp) ────────────────


def test_extract_flag_entities_separates_percentages_from_organizations():
    fake_nlp = FakeNlp(
        [
            FakeEntity("Ford Motor Credit", "ORG"),
            FakeEntity("2.1%", "PERCENT"),
            FakeEntity("3%", "PERCENT"),
        ]
    )
    result = extract_flag_entities(REAL_FORD_FLAG_TEXT, nlp=fake_nlp)
    assert result["percentages"] == ["2.1%", "3%"]
    assert result["organizations"] == ["Ford Motor Credit"]


def test_extract_flag_entities_returns_empty_lists_when_nlp_is_unavailable():
    result = extract_flag_entities(REAL_FORD_FLAG_TEXT, nlp=None)
    assert result == {"percentages": [], "organizations": [], "money": []}


# ── audit_compliance_narrative (the genuinely valuable capability) ──


def test_audit_flags_a_narrative_whose_stated_percentage_matches_the_real_one():
    fake_nlp = FakeNlp([FakeEntity("2.1%", "PERCENT")])
    result = audit_compliance_narrative(REAL_FORD_FLAG_TEXT, real_percentage=0.021, nlp=fake_nlp)
    assert result["stated_percentage"] == pytest.approx(0.021)
    assert result["matches_real_data"] is True


def test_audit_treats_a_difference_exactly_at_the_tolerance_boundary_as_a_match():
    # 0.25/0.75/0.5 are exact in binary floating point, so this isolates the
    # <= vs < boundary decision from float rounding noise.
    fake_nlp = FakeNlp([FakeEntity("25%", "PERCENT")])
    result = audit_compliance_narrative(
        "25% stated.", real_percentage=0.75, nlp=fake_nlp, tolerance=0.5
    )
    assert result["matches_real_data"] is True


def test_audit_flags_a_narrative_whose_stated_percentage_diverges_from_the_real_one():
    """The genuinely valuable case: a stale or wrong compliance narrative
    that no longer matches the portfolio's real, current numbers."""
    fake_nlp = FakeNlp([FakeEntity("2.1%", "PERCENT")])
    result = audit_compliance_narrative(REAL_FORD_FLAG_TEXT, real_percentage=0.045, nlp=fake_nlp)
    assert result["matches_real_data"] is False


def test_audit_reports_no_stated_percentage_honestly_rather_than_guessing():
    fake_nlp = FakeNlp([])
    result = audit_compliance_narrative("No numbers here.", real_percentage=0.021, nlp=fake_nlp)
    assert result["stated_percentage"] is None
    assert result["matches_real_data"] is None


# ── Real spaCy, guarded -- proves the whole pipeline actually works ──


@pytest.mark.skipif(not spacy_available(), reason="spacy/en_core_web_sm not installed")
def test_real_spacy_extracts_percentages_from_a_real_compliance_flag():
    nlp = resolve_nlp_model()
    result = extract_flag_entities(REAL_CARNIVAL_FLAG_TEXT, nlp=nlp)
    assert "3.0%" in result["percentages"] or "3.0" in " ".join(result["percentages"])
