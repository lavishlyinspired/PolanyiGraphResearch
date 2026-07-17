from rdflib import RDF

from graphos.semantic.documents import (
    DocumentExtraction,
    ExtractedMention,
    HeuristicExtractor,
    IngestedDocument,
    document_to_rdf,
    parse_file,
    resolve_mentions,
)
from graphos.models import GlossaryEntry, SemanticContext
from graphos.semantic.rdf import GOS, validate_rdf

SAMPLE = """Goldman Sachs Group Inc executed trades worth $98,500,000 on 2026-01-17.
The desk's VaR remained within the notional amount limits set for US Treasury 10Y."""


def test_parse_file_reads_text_and_markdown(tmp_path):
    md = tmp_path / "report.md"
    md.write_text("# Q1 Report\n\nGoldman Sachs traded **AAPL**.", encoding="utf-8")
    text = parse_file(str(md))
    assert "Goldman Sachs" in text
    assert "#" not in text.splitlines()[0]


def test_parse_file_strips_html_tags(tmp_path):
    html = tmp_path / "filing.html"
    html.write_text(
        "<html><body><h1>Filing</h1><p>Morgan Stanley bought bonds.</p></body></html>",
        encoding="utf-8",
    )
    text = parse_file(str(html))
    assert "Morgan Stanley bought bonds." in text
    assert "<p>" not in text


def test_heuristic_extractor_finds_organizations_dates_and_amounts():
    extraction = HeuristicExtractor().extract(SAMPLE)
    types = {m.entity_type for m in extraction.mentions}
    assert "Date" in types
    assert "MonetaryAmount" in types
    org_texts = {m.text for m in extraction.mentions if m.entity_type == "Organization"}
    assert any("Goldman Sachs" in t for t in org_texts)


def test_heuristic_extractor_normalizes_whitespace_in_mentions():
    extraction = HeuristicExtractor().extract("Deals with Goldman Sachs\nGroup Inc closed.")
    org = next(m for m in extraction.mentions if m.entity_type == "Organization")
    assert "\n" not in org.text
    assert org.text == "Goldman Sachs Group Inc"


def test_glossary_terms_in_text_are_always_captured_even_if_extractor_misses_them():
    """The glossary is known — finding its terms in text is deterministic work,
    not a job for a model. This guarantees document→term links for Graph RAG."""
    from graphos.semantic.documents import scan_glossary_terms

    mentions = scan_glossary_terms(SAMPLE, make_context())
    assert any(
        m.text.lower() == "notional amount" and m.entity_type == "Metric"
        for m in mentions
    )


def test_glossary_scan_reports_each_term_once():
    from graphos.semantic.documents import scan_glossary_terms

    text = "The notional amount grew; notional amount limits held."
    mentions = scan_glossary_terms(text, make_context())
    assert len([m for m in mentions if m.text.lower() == "notional amount"]) == 1


class FakeGLiNERModel:
    def predict_entities(self, text, labels, threshold=0.5):
        return [
            {"text": "Goldman Sachs Group Inc", "label": "organization", "start": 0, "score": 0.95},
            {"text": "US Treasury 10Y", "label": "financial instrument", "start": 120, "score": 0.9},
            {"text": "made up thing", "label": "unmapped label", "start": 50, "score": 0.9},
        ]


def test_gliner_extractor_maps_labels_to_entity_types():
    from graphos.semantic.documents import GLiNERExtractor

    extraction = GLiNERExtractor(model=FakeGLiNERModel()).extract(SAMPLE)
    by_text = {m.text: m.entity_type for m in extraction.mentions}
    assert by_text["Goldman Sachs Group Inc"] == "Organization"
    assert by_text["US Treasury 10Y"] == "FinancialInstrument"
    assert by_text["made up thing"] == "Other"


def test_gliner_extractor_without_package_gives_install_hint():
    import pytest as _pytest

    from graphos.semantic.documents import GLiNERExtractor

    with _pytest.raises(ImportError, match="pip install gliner"):
        GLiNERExtractor().extract(SAMPLE)


def test_make_extractor_honors_env_override(monkeypatch):
    from graphos.semantic.documents import HeuristicExtractor, LLMExtractor, make_extractor

    monkeypatch.setenv("GRAPHOS_EXTRACTOR", "heuristic")
    assert isinstance(make_extractor(llm=object()), HeuristicExtractor)
    monkeypatch.delenv("GRAPHOS_EXTRACTOR")
    assert isinstance(make_extractor(llm=object()), LLMExtractor)


def make_document() -> IngestedDocument:
    return IngestedDocument(
        source="sample-report.md",
        title="Sample Report",
        text=SAMPLE,
        extraction=DocumentExtraction(
            mentions=[
                ExtractedMention(
                    text="Goldman Sachs Group Inc",
                    entity_type="Organization",
                    context="Goldman Sachs Group Inc executed trades",
                ),
                ExtractedMention(
                    text="notional amount",
                    entity_type="Metric",
                    context="within the notional amount limits",
                ),
            ]
        ),
    )


def make_context() -> SemanticContext:
    return SemanticContext(
        domain="Financial Services",
        glossary=[
            GlossaryEntry(
                term="Notional Amount",
                definition="Total value of a trade",
                source_tables=["trades"],
                source_columns=["notional_amount"],
            )
        ],
    )


def test_resolve_mentions_links_to_glossary_terms_deterministically():
    doc = resolve_mentions(make_document(), make_context())
    metric = next(m for m in doc.extraction.mentions if m.entity_type == "Metric")
    assert metric.resolved_term == "Notional Amount"
    org = next(m for m in doc.extraction.mentions if m.entity_type == "Organization")
    assert org.resolved_term is None


def test_resolution_overrides_llm_prefilled_terms():
    """The LLM may populate resolved_term during extraction — resolution is
    the deterministic layer's decision, so prefilled values must be replaced."""
    doc = make_document()
    for mention in doc.extraction.mentions:
        mention.resolved_term = mention.text
    resolved = resolve_mentions(doc, make_context())
    org = next(m for m in resolved.extraction.mentions if m.entity_type == "Organization")
    assert org.resolved_term is None
    metric = next(m for m in resolved.extraction.mentions if m.entity_type == "Metric")
    assert metric.resolved_term == "Notional Amount"


def test_document_rdf_carries_provenance_and_mentions():
    doc = resolve_mentions(make_document(), make_context())
    graph = document_to_rdf(doc)
    docs = list(graph.subjects(RDF.type, GOS.Document))
    assert len(docs) == 1
    mentions = list(graph.subjects(RDF.type, GOS.Mention))
    assert len(mentions) == 2
    for mention in mentions:
        assert next(graph.objects(mention, GOS.inDocument)) == docs[0]
    refers = list(graph.objects(None, GOS.refersTo))
    assert len(refers) == 1, "resolved mention must link to the glossary term URI"


def test_document_rdf_conforms_to_shacl_shapes():
    graph = document_to_rdf(resolve_mentions(make_document(), make_context()))
    conforms, report = validate_rdf(graph)
    assert conforms, report


def test_document_rdf_without_text_fails_shacl():
    graph = document_to_rdf(make_document())
    mention = next(graph.subjects(RDF.type, GOS.Mention))
    graph.remove((mention, GOS.mentionText, None))
    conforms, _ = validate_rdf(graph)
    assert not conforms
