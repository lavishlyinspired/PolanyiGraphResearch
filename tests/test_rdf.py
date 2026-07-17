from rdflib import RDF, SKOS, URIRef

from graphos.models import (
    BusinessRuleContext,
    EntityRelationship,
    GlossaryEntry,
    SemanticContext,
)
from graphos.semantic.rdf import GOS, context_to_rdf, local_sparql, validate_rdf


def make_context() -> SemanticContext:
    return SemanticContext(
        domain="Financial Services",
        glossary=[
            GlossaryEntry(
                term="Settlement Date",
                definition="Date on which a trade settles",
                source_tables=["trades"],
                source_columns=["settlement_date"],
                ontology_class="Settlement Date",
                ontology_uri=(
                    "https://spec.edmcouncil.org/fibo/ontology/FND/DatesAndTimes/"
                    "FinancialDates/SettlementDate"
                ),
            ),
            GlossaryEntry(
                term="Notional Amount",
                definition="Total value of a trade",
                source_tables=["trades"],
                source_columns=["notional_amount"],
            ),
        ],
        relationships=[
            EntityRelationship(
                from_entity="trades",
                to_entity="counterparties",
                relationship_type="many-to-one",
                foreign_key="counterparty_id",
                description="Each trade has one counterparty",
            )
        ],
        business_rules=[
            BusinessRuleContext(
                rule_id="BR-001",
                name="Sanctioned Counterparty Check",
                description="No trades with sanctioned counterparties",
                sql_hints=["is_sanctioned = TRUE"],
                affected_entities=["trades", "counterparties"],
                severity="CRITICAL",
            )
        ],
        key_entities=["trades", "counterparties"],
    )


def test_glossary_terms_become_skos_concepts():
    graph = context_to_rdf(make_context())
    concepts = list(graph.subjects(RDF.type, SKOS.Concept))
    assert len(concepts) == 2
    labels = {str(o) for o in graph.objects(None, SKOS.prefLabel)}
    assert {"Settlement Date", "Notional Amount"} <= labels


def test_aligned_terms_link_to_fibo_via_exact_match():
    graph = context_to_rdf(make_context())
    fibo_uri = URIRef(
        "https://spec.edmcouncil.org/fibo/ontology/FND/DatesAndTimes/"
        "FinancialDates/SettlementDate"
    )
    matches = list(graph.subjects(SKOS.exactMatch, fibo_uri))
    assert len(matches) == 1


def test_entities_and_relationships_are_modeled():
    graph = context_to_rdf(make_context())
    entities = list(graph.subjects(RDF.type, GOS.Entity))
    assert len(entities) == 2
    rels = list(graph.subjects(RDF.type, GOS.Relationship))
    assert len(rels) == 1
    fk = next(graph.objects(rels[0], GOS.foreignKey))
    assert str(fk) == "counterparty_id"


def test_business_rules_carry_severity():
    graph = context_to_rdf(make_context())
    rule = next(graph.subjects(RDF.type, GOS.BusinessRule))
    severity = next(graph.objects(rule, GOS.severity))
    assert str(severity) == "CRITICAL"


def test_valid_context_conforms_to_shacl_shapes():
    conforms, report = validate_rdf(context_to_rdf(make_context()))
    assert conforms, report


def test_shacl_rejects_terms_without_definitions():
    graph = context_to_rdf(make_context())
    term = next(graph.subjects(RDF.type, SKOS.Concept))
    graph.remove((term, SKOS.definition, None))
    conforms, report = validate_rdf(graph)
    assert not conforms
    assert "definition" in report.lower()


def test_shacl_rejects_invalid_severity():
    graph = context_to_rdf(make_context())
    rule = next(graph.subjects(RDF.type, GOS.BusinessRule))
    graph.remove((rule, GOS.severity, None))
    from rdflib import Literal

    graph.add((rule, GOS.severity, Literal("WHENEVER")))
    conforms, _report = validate_rdf(graph)
    assert not conforms


def test_local_sparql_queries_the_context_without_graphdb():
    graph = context_to_rdf(make_context())
    rows = local_sparql(
        graph.serialize(format="turtle"),
        """
        PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
        SELECT ?label WHERE { ?term a skos:Concept ; skos:prefLabel ?label }
        ORDER BY ?label
        """,
    )
    assert [r["label"] for r in rows] == ["Notional Amount", "Settlement Date"]
