from graphos.knowledge_graph import guard_cypher, materialization_statements
from graphos.models import (
    EntityRelationship,
    GlossaryEntry,
    SemanticContext,
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
                ontology_class="notional amount",
                ontology_uri="urn:fibo:NotionalAmount",
            )
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
        key_entities=["trades", "counterparties"],
    )


# ── Cypher guard ─────────────────────────────────────────────────


def test_guard_allows_read_queries():
    assert guard_cypher("MATCH (c:Concept) RETURN c.name LIMIT 5") is None


def test_guard_blocks_writes():
    for query in (
        "CREATE (n:Hack)",
        "MATCH (n) DETACH DELETE n",
        "MATCH (n) SET n.x = 1",
        "MERGE (n:Concept {name: 'x'})",
        "MATCH (n) REMOVE n.name",
        "DROP INDEX foo",
    ):
        assert guard_cypher(query) is not None, query


def test_guard_blocks_unsafe_procedures_but_allows_schema_reads():
    assert guard_cypher("CALL apoc.load.json('file:///etc/passwd')") is not None
    assert guard_cypher("CALL db.labels()") is None


# ── Materialization ──────────────────────────────────────────────


def test_materialization_creates_entity_nodes_and_relationship_edges():
    statements = [s for s, _ in materialization_statements(make_context())]
    assert any("MERGE (e:Entity {name: $name})" in s for s in statements)
    assert any("MERGE (a)-[r:RELATES_TO" in s for s in statements)


def test_materialization_links_glossary_terms_to_entities_and_ontology():
    statements = materialization_statements(make_context())
    term_params = [p for s, p in statements if "Term" in s and p.get("term")]
    assert any(p["term"] == "Notional Amount" for p in term_params)
    assert any(p.get("ontology_uri") == "urn:fibo:NotionalAmount" for p in term_params)


def test_materialization_parameters_never_interpolate_values():
    for statement, _params in materialization_statements(make_context()):
        assert "Notional" not in statement, "values must be parameters, not inline"
