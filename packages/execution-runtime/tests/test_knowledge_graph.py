from polanyi.execution.knowledge_graph import guard_cypher, materialization_statements
from polanyi.models import (
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


# ── Document projection (Graph RAG) ──────────────────────────────


def make_document():
    from polanyi.semantic.documents import DocumentExtraction, ExtractedMention, IngestedDocument

    return IngestedDocument(
        source="examples/report.md",
        title="Q1 Report",
        text="...",
        extraction=DocumentExtraction(
            mentions=[
                ExtractedMention(
                    text="notional amount",
                    entity_type="Metric",
                    context="within the notional amount limits",
                    resolved_term="Notional Amount",
                ),
                ExtractedMention(
                    text="Goldman Sachs Group Inc",
                    entity_type="Organization",
                    context="Goldman Sachs Group Inc executed trades",
                ),
            ]
        ),
    )


def test_document_projection_creates_document_and_mention_nodes():
    from polanyi.execution.knowledge_graph import document_materialization_statements

    statements = document_materialization_statements(make_document())
    text = " ".join(s for s, _ in statements)
    assert "MERGE (d:Document {source: $source})" in text
    assert "MERGE (m:Mention {id: $id})" in text
    assert "MERGE (d)-[:MENTIONS]->(m)" in text


def test_resolved_mentions_link_to_terms_for_graph_rag():
    from polanyi.execution.knowledge_graph import document_materialization_statements

    statements = document_materialization_statements(make_document())
    refers = [(s, p) for s, p in statements if "REFERS_TO" in s]
    assert len(refers) == 1
    assert refers[0][1]["term"] == "Notional Amount"


def test_document_projection_is_parameterized_and_idempotent_by_id():
    from polanyi.execution.knowledge_graph import document_materialization_statements

    statements = document_materialization_statements(make_document())
    for statement, _params in statements:
        assert "Goldman" not in statement
    mention_ids = [p["id"] for s, p in statements if "MERGE (m:Mention {id" in s]
    assert len(mention_ids) == len(set(mention_ids))


# ── Vector + fulltext search indexes (Phase 2) ───────────────────


def test_fulltext_index_statement_is_idempotent_and_targets_term_text_fields():
    from polanyi.execution.knowledge_graph import fulltext_index_statement

    statement = fulltext_index_statement()
    assert "IF NOT EXISTS" in statement
    assert "FOR (t:Term)" in statement
    assert "t.term" in statement
    assert "t.definition" in statement


def test_vector_index_statement_uses_the_real_embedding_dimension_not_a_guess():
    from polanyi.execution.knowledge_graph import vector_index_statement

    # The plan's original draft hardcoded 768 without checking which provider
    # is actually configured (LocalEmbeddingProvider's all-MiniLM-L6-v2 is
    # 384-dim; ApiEmbeddingProvider's text-embedding-3-small is 1536-dim) --
    # the index must be built from the real vector length, whatever it is.
    assert "384" in vector_index_statement(384)
    assert "1536" in vector_index_statement(1536)
    assert "768" not in vector_index_statement(384)


def test_vector_index_statement_is_idempotent_and_targets_term_embedding():
    from polanyi.execution.knowledge_graph import vector_index_statement

    statement = vector_index_statement(384)
    assert "IF NOT EXISTS" in statement
    assert "FOR (t:Term) ON (t.embedding)" in statement
    assert "cosine" in statement


def test_embedding_statements_pairs_each_term_with_its_own_real_vector():
    from polanyi.execution.knowledge_graph import embedding_statements

    glossary = make_context().glossary
    vectors = [[0.1, 0.2, 0.3]]
    statements = embedding_statements(glossary, vectors)
    assert len(statements) == 1
    statement, params = statements[0]
    assert params["term"] == "Notional Amount"
    assert params["embedding"] == [0.1, 0.2, 0.3]


def test_embedding_statements_never_inlines_the_vector_into_cypher_text():
    from polanyi.execution.knowledge_graph import embedding_statements

    glossary = make_context().glossary
    statements = embedding_statements(glossary, [[0.1, 0.2, 0.3]])
    statement, _params = statements[0]
    assert "0.1" not in statement
    assert "$embedding" in statement
