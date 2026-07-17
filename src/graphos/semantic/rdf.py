"""RDF semantic layer: the context as a SKOS/OWL-friendly graph.

The glossary becomes a SKOS vocabulary (skos:Concept, prefLabel, definition),
entities and relationships get the lightweight gos: ontology, business rules
carry severity, and FIBO alignments become skos:exactMatch links. pySHACL
validates the result against bundled shapes; the graph can be published to
GraphDB (named graph) or queried locally with pyoxigraph — no server needed.
"""

from __future__ import annotations

import re
from importlib import resources
from typing import Any, Optional

import httpx
from rdflib import RDF, RDFS, SKOS, Graph, Literal, Namespace, URIRef

from graphos.models import SemanticContext

GOS = Namespace("https://graphos.dev/ontology#")
ENTITY = Namespace("https://graphos.dev/entity/")
TERM = Namespace("https://graphos.dev/term/")
RULE = Namespace("https://graphos.dev/rule/")
RELATION = Namespace("https://graphos.dev/relationship/")

CONTEXT_GRAPH_IRI = "urn:graphos:context"


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def context_to_rdf(context: SemanticContext) -> Graph:
    graph = Graph()
    graph.bind("gos", GOS)
    graph.bind("skos", SKOS)

    ctx_node = URIRef(CONTEXT_GRAPH_IRI)
    graph.add((ctx_node, RDF.type, GOS.SemanticContext))
    graph.add((ctx_node, GOS.domain, Literal(context.domain)))
    graph.add((ctx_node, GOS.generatedBy, Literal(context.generated_by)))

    for entity_name in sorted(
        set(context.key_entities)
        | {r.from_entity for r in context.relationships}
        | {r.to_entity for r in context.relationships}
        | {t for g in context.glossary for t in g.source_tables}
    ):
        entity = ENTITY[_slug(entity_name)]
        graph.add((entity, RDF.type, GOS.Entity))
        graph.add((entity, RDFS.label, Literal(entity_name)))

    for rel in context.relationships:
        node = RELATION[_slug(f"{rel.from_entity}-{rel.to_entity}-{rel.foreign_key}")]
        graph.add((node, RDF.type, GOS.Relationship))
        graph.add((node, GOS["from"], ENTITY[_slug(rel.from_entity)]))
        graph.add((node, GOS.to, ENTITY[_slug(rel.to_entity)]))
        graph.add((node, GOS.foreignKey, Literal(rel.foreign_key)))
        graph.add((node, GOS.relationshipType, Literal(rel.relationship_type)))
        graph.add((node, RDFS.comment, Literal(rel.description)))
        graph.add(
            (ENTITY[_slug(rel.from_entity)], GOS.relatesTo, ENTITY[_slug(rel.to_entity)])
        )

    for entry in context.glossary:
        term = TERM[_slug(entry.term)]
        graph.add((term, RDF.type, SKOS.Concept))
        graph.add((term, SKOS.prefLabel, Literal(entry.term)))
        graph.add((term, SKOS.definition, Literal(entry.definition)))
        if entry.formula:
            graph.add((term, GOS.formula, Literal(entry.formula)))
        if entry.unit:
            graph.add((term, GOS.unit, Literal(entry.unit)))
        for synonym in entry.synonyms:
            graph.add((term, SKOS.altLabel, Literal(synonym)))
        for table in entry.source_tables:
            graph.add((term, GOS.describes, ENTITY[_slug(table)]))
        for column in entry.source_columns:
            graph.add((term, GOS.sourceColumn, Literal(column)))
        if entry.ontology_uri:
            graph.add((term, SKOS.exactMatch, URIRef(entry.ontology_uri)))

    for rule in context.business_rules:
        node = RULE[_slug(rule.rule_id)]
        graph.add((node, RDF.type, GOS.BusinessRule))
        graph.add((node, RDFS.label, Literal(rule.name)))
        graph.add((node, SKOS.definition, Literal(rule.description)))
        graph.add((node, GOS.severity, Literal(rule.severity)))
        for hint in rule.sql_hints:
            graph.add((node, GOS.sqlHint, Literal(hint)))
        for entity_name in rule.affected_entities:
            graph.add((node, GOS.appliesTo, ENTITY[_slug(entity_name)]))

    return graph


def _shapes_graph() -> Graph:
    graph = Graph()
    shapes_dir = resources.files("graphos") / "shapes"
    for entry in shapes_dir.iterdir():
        if entry.name.endswith(".ttl"):
            graph.parse(data=entry.read_text(encoding="utf-8"), format="turtle")
    return graph


def validate_rdf(graph: Graph) -> tuple[bool, str]:
    """Validate the context graph against the bundled SHACL shapes."""
    from pyshacl import validate

    conforms, _results_graph, report_text = validate(
        graph, shacl_graph=_shapes_graph(), inference="none"
    )
    return bool(conforms), str(report_text)


def local_sparql(turtle: str, query: str) -> list[dict[str, Any]]:
    """Run SPARQL over serialized Turtle with pyoxigraph — no server required."""
    from pyoxigraph import RdfFormat, Store

    store = Store()
    store.load(turtle.encode("utf-8"), RdfFormat.TURTLE)
    results = store.query(query)
    rows = []
    for solution in results:
        rows.append(
            {
                str(var.value): _oxi_value(solution[var])
                for var in results.variables
                if solution[var] is not None
            }
        )
    return rows


def _oxi_value(term) -> str:
    value = getattr(term, "value", None)
    return str(value if value is not None else term)


def publish_to_graphdb(
    graph: Graph,
    endpoint: Optional[str] = None,
    repository: Optional[str] = None,
    named_graph: str = CONTEXT_GRAPH_IRI,
    replace: bool = True,
) -> str:
    """Publish to a GraphDB named graph.

    replace=True swaps the whole named graph (idempotent — right for the
    context); replace=False appends (right for accumulating documents).
    """
    import os

    ep = (endpoint or os.environ.get("GRAPHDB_ENDPOINT", "")).rstrip("/")
    repo = repository or os.environ.get("GRAPHDB_REPOSITORY", "fibo")
    if not ep:
        raise ValueError("GRAPHDB_ENDPOINT is required to publish")

    method = httpx.put if replace else httpx.post
    response = method(
        f"{ep}/repositories/{repo}/statements",
        params={"context": f"<{named_graph}>"},
        content=graph.serialize(format="turtle"),
        headers={"Content-Type": "text/turtle"},
        timeout=30,
    )
    response.raise_for_status()
    return named_graph
