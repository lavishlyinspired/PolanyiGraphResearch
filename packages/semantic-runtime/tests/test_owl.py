import pytest

from graphos.semantic.owl import OwlReasoner, java_available

TINY_ONTOLOGY = """<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xml:base="http://example.org/fin">
  <owl:Ontology rdf:about="http://example.org/fin"/>
  <owl:Class rdf:about="http://example.org/fin#FinancialInstrument">
    <rdfs:label>financial instrument</rdfs:label>
  </owl:Class>
  <owl:Class rdf:about="http://example.org/fin#DebtInstrument">
    <rdfs:label>debt instrument</rdfs:label>
    <rdfs:subClassOf rdf:resource="http://example.org/fin#FinancialInstrument"/>
  </owl:Class>
  <owl:Class rdf:about="http://example.org/fin#Bond">
    <rdfs:label>bond</rdfs:label>
    <rdfs:subClassOf rdf:resource="http://example.org/fin#DebtInstrument"/>
  </owl:Class>
  <owl:Class rdf:about="http://example.org/fin#CorporateBond">
    <rdfs:label>corporate bond</rdfs:label>
    <rdfs:subClassOf rdf:resource="http://example.org/fin#Bond"/>
  </owl:Class>
</rdf:RDF>
"""


@pytest.fixture()
def reasoner(tmp_path):
    owl_file = tmp_path / "fin.owl"
    owl_file.write_text(TINY_ONTOLOGY, encoding="utf-8")
    r = OwlReasoner()
    r.load_file(str(owl_file))
    return r


def test_ancestors_walk_the_full_chain(reasoner):
    ancestors = reasoner.ancestors("http://example.org/fin#CorporateBond")
    labels = [a.label for a in ancestors]
    assert labels == ["bond", "debt instrument", "financial instrument"]


def test_descendants_expand_the_hierarchy_downward(reasoner):
    descendants = reasoner.descendants("http://example.org/fin#FinancialInstrument")
    labels = {d.label for d in descendants}
    assert labels == {"debt instrument", "bond", "corporate bond"}


def test_unknown_class_yields_empty_results(reasoner):
    assert reasoner.ancestors("http://example.org/fin#Nope") == []
    assert reasoner.descendants("http://example.org/fin#Nope") == []


def test_reasoner_reports_java_dependency_honestly(reasoner):
    result = reasoner.run_reasoner()
    if java_available():
        assert result.ran
    else:
        assert not result.ran
        assert "Java" in result.detail


@pytest.mark.skipif(not java_available(), reason="HermiT needs a Java runtime")
def test_hermit_confirms_consistency(reasoner):
    result = reasoner.run_reasoner()
    assert result.ran
    assert result.consistent
