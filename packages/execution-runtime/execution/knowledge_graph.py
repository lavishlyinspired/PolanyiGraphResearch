"""Neo4j knowledge graph: materialize the semantic context, query it safely.

The business view goes into Neo4j (entities, relationships, glossary terms,
ontology links) — the "enterprise knowledge graph" from the Studio UI. Cypher
execution is read-only: writes happen only through `materialize`, agent
queries pass through `guard_cypher` first.
"""

from __future__ import annotations

import os
import re
from typing import Any, Optional

from polanyi.models import SemanticContext

_WRITE_KEYWORDS = re.compile(
    r"\b(CREATE|MERGE|DELETE|DETACH|SET|REMOVE|DROP|FOREACH|LOAD\s+CSV)\b",
    re.IGNORECASE,
)
_SAFE_PROCEDURES = re.compile(
    r"CALL\s+(db\.(labels|relationshipTypes|propertyKeys|schema)\b|dbms\.components\b)",
    re.IGNORECASE,
)
_ANY_PROCEDURE = re.compile(r"\bCALL\b", re.IGNORECASE)


def guard_cypher(query: str) -> Optional[str]:
    """Return a violation message for write/unsafe Cypher, None when read-only."""
    if _WRITE_KEYWORDS.search(query):
        keyword = _WRITE_KEYWORDS.search(query).group(1).upper()
        return f"Only read-only Cypher is allowed; found '{keyword}'."
    if _ANY_PROCEDURE.search(query) and not _SAFE_PROCEDURES.search(query):
        return "Only schema-inspection procedures (db.labels, db.schema, ...) are allowed."
    return None


def materialization_statements(
    context: SemanticContext,
) -> list[tuple[str, dict[str, Any]]]:
    """Parameterized Cypher statements that project the context into Neo4j."""
    statements: list[tuple[str, dict[str, Any]]] = []

    for entity in context.key_entities:
        statements.append(
            (
                "MERGE (e:Entity {name: $name}) SET e.domain = $domain",
                {"name": entity, "domain": context.domain},
            )
        )

    for rel in context.relationships:
        statements.append(
            (
                "MERGE (a:Entity {name: $from_entity}) "
                "MERGE (b:Entity {name: $to_entity}) "
                "MERGE (a)-[r:RELATES_TO {foreign_key: $foreign_key}]->(b) "
                "SET r.type = $rel_type, r.description = $description",
                {
                    "from_entity": rel.from_entity,
                    "to_entity": rel.to_entity,
                    "foreign_key": rel.foreign_key,
                    "rel_type": rel.relationship_type,
                    "description": rel.description,
                },
            )
        )

    for entry in context.glossary:
        params = {
            "term": entry.term,
            "definition": entry.definition,
            "ontology_class": entry.ontology_class,
            "ontology_uri": entry.ontology_uri,
        }
        statements.append(
            (
                "MERGE (t:Term {term: $term}) "
                "SET t.definition = $definition, t.ontology_class = $ontology_class, "
                "t.ontology_uri = $ontology_uri",
                params,
            )
        )
        if entry.ontology_uri:
            statements.append(
                (
                    "MATCH (t:Term {term: $term}) "
                    "MATCH (c:owl__Class {uri: $ontology_uri}) "
                    "MERGE (t)-[:RECONCILED_TO_FIBO_CLASS]->(c)",
                    {"term": entry.term, "ontology_uri": entry.ontology_uri},
                )
            )
        for table in entry.source_tables:
            statements.append(
                (
                    "MATCH (t:Term {term: $term}) "
                    "MERGE (e:Entity {name: $name}) "
                    "MERGE (t)-[:DESCRIBES]->(e)",
                    {"term": entry.term, "name": table},
                )
            )
    return statements


def document_materialization_statements(doc) -> list[tuple[str, dict[str, Any]]]:
    """Project an ingested document into Neo4j for Graph RAG.

    (:Document)-[:MENTIONS]->(:Mention)-[:REFERS_TO]->(:Term) — documents become
    traversable context connected to the business glossary.
    """
    doc_slug = re.sub(r"[^a-z0-9]+", "-", (doc.title or doc.source).lower()).strip("-")
    statements: list[tuple[str, dict[str, Any]]] = [
        (
            "MERGE (d:Document {source: $source}) SET d.title = $title",
            {"source": doc.source, "title": doc.title},
        )
    ]
    for index, mention in enumerate(doc.extraction.mentions):
        mention_id = f"{doc_slug}-{index}"
        statements.append(
            (
                "MATCH (d:Document {source: $source}) "
                "MERGE (m:Mention {id: $id}) "
                "SET m.text = $text, m.entity_type = $entity_type, m.context = $context "
                "MERGE (d)-[:MENTIONS]->(m)",
                {
                    "source": doc.source,
                    "id": mention_id,
                    "text": mention.text,
                    "entity_type": mention.entity_type,
                    "context": mention.context,
                },
            )
        )
        if mention.resolved_term:
            statements.append(
                (
                    "MATCH (m:Mention {id: $id}) "
                    "MERGE (t:Term {term: $term}) "
                    "MERGE (m)-[:REFERS_TO]->(t)",
                    {"id": mention_id, "term": mention.resolved_term},
                )
            )
    return statements


def fulltext_index_statement() -> str:
    """Lexical search index on Term text fields — dimension-independent, so it
    can always be created once any terms exist, regardless of whether an
    embedding provider is configured."""
    return "CREATE FULLTEXT INDEX term_fulltext IF NOT EXISTS FOR (t:Term) ON EACH [t.term, t.definition]"


def vector_index_statement(dimensions: int) -> str:
    """Semantic search index on Term.embedding. `dimensions` must match the
    real embedding vectors that will be written — LocalEmbeddingProvider's
    all-MiniLM-L6-v2 is 384-dim, ApiEmbeddingProvider's text-embedding-3-small
    is 1536-dim; there is no single correct constant, so callers must derive
    it from an actual computed vector rather than guessing."""
    return (
        "CREATE VECTOR INDEX term_embedding IF NOT EXISTS "
        "FOR (t:Term) ON (t.embedding) "
        "OPTIONS {indexConfig: {`vector.dimensions`: "
        f"{dimensions}, `vector.similarity_function`: 'cosine'}}}}"
    )


def embedding_statements(
    glossary: list[Any], embeddings: list[list[float]]
) -> list[tuple[str, dict[str, Any]]]:
    """Pair each glossary term with its precomputed embedding vector.
    Parameterized — the vector is never inlined into Cypher text."""
    return [
        ("MATCH (t:Term {term: $term}) SET t.embedding = $embedding", {"term": entry.term, "embedding": vector})
        for entry, vector in zip(glossary, embeddings)
    ]


class Neo4jGraphStore:
    def __init__(
        self,
        uri: Optional[str] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        connection_timeout: float = 2.0,
    ):
        """Defaults to a bounded connection_timeout, not the neo4j driver's
        own default (30s) — capabilities.py constructs this with no
        explicit timeout at registration time and inside tool bodies; an
        unreachable/misconfigured NEO4J_URI must fail fast there, not hang
        for up to 30s (confirmed by direct reproduction: a real unreachable
        address took 30.19s with the driver's default, 2.2s with this one)."""
        from neo4j import GraphDatabase

        self._driver = GraphDatabase.driver(
            uri or os.environ.get("NEO4J_URI", "neo4j://127.0.0.1:7687"),
            auth=(
                username or os.environ.get("NEO4J_USERNAME", "neo4j"),
                password or os.environ.get("NEO4J_PASSWORD", ""),
            ),
            connection_timeout=connection_timeout,
        )

    def is_available(self) -> bool:
        try:
            self._driver.verify_connectivity()
            return True
        except Exception:  # noqa: BLE001 — availability probe
            return False

    def materialize(self, context: SemanticContext) -> dict[str, int]:
        """Project the semantic context into Neo4j. Idempotent (MERGE-based).

        Stats are scoped to the names in this context — pre-existing graph
        content is neither counted nor touched.
        """
        entity_names = sorted(
            set(context.key_entities)
            | {r.from_entity for r in context.relationships}
            | {r.to_entity for r in context.relationships}
            | {t for g in context.glossary for t in g.source_tables}
        )
        term_names = [g.term for g in context.glossary]

        statements = materialization_statements(context)
        with self._driver.session() as session:
            for statement, params in statements:
                session.run(statement, params)
            counts = session.run(
                "MATCH (e:Entity) WHERE e.name IN $entities WITH count(e) AS entities "
                "MATCH (t:Term) WHERE t.term IN $terms WITH entities, count(t) AS terms "
                "MATCH (a:Entity)-[r:RELATES_TO]->(:Entity) WHERE a.name IN $entities "
                "RETURN entities, terms, count(r) AS rels",
                {"entities": entity_names, "terms": term_names},
            ).single()
        if counts["terms"] > 0:
            with self._driver.session() as session:
                session.run(fulltext_index_statement())
            self._write_term_embeddings(context.glossary)
        return {
            "entities": counts["entities"],
            "terms": counts["terms"],
            "relationships": counts["rels"],
        }

    def _write_term_embeddings(self, glossary: list[Any]) -> None:
        """Best-effort: embeddings are opt-in (`POLANYI_EMBEDDING_PROVIDER`),
        so this silently does nothing when no provider is configured — matches
        the same LLM-optional posture as FIBO alignment's embedding index."""
        from polanyi.semantic.embeddings import resolve_embedding_provider

        provider = resolve_embedding_provider()
        if provider is None or not glossary:
            return
        vectors = provider.embed([f"{entry.term}: {entry.definition}" for entry in glossary])
        if not vectors:
            return
        with self._driver.session() as session:
            session.run(vector_index_statement(len(vectors[0])))
            for statement, params in embedding_statements(glossary, vectors):
                session.run(statement, params)

    def hybrid_search(
        self, query_vector: Optional[list[float]], query_text: str, top_k: int
    ) -> dict[str, list[dict[str, Any]]]:
        """Real vector + fulltext hits from their respective Term indexes.
        Either leg is an empty list — never fabricated — when its index
        doesn't exist yet (graph not materialized with that provider active)."""
        vector_hits: list[dict[str, Any]] = []
        fulltext_hits: list[dict[str, Any]] = []
        with self._driver.session() as session:
            if query_vector is not None:
                try:
                    vector_hits = [
                        {"term": record["node"]["term"], "score": record["score"]}
                        for record in session.run(
                            "CALL db.index.vector.queryNodes('term_embedding', $top_k, $vector) "
                            "YIELD node, score RETURN node, score",
                            {"top_k": top_k, "vector": query_vector},
                        )
                    ]
                except Exception:  # noqa: BLE001 — index may not exist yet
                    vector_hits = []
            try:
                fulltext_hits = [
                    {"term": record["node"]["term"], "score": record["score"]}
                    for record in session.run(
                        "CALL db.index.fulltext.queryNodes('term_fulltext', $query) "
                        "YIELD node, score RETURN node, score LIMIT $top_k",
                        {"query": query_text, "top_k": top_k},
                    )
                ]
            except Exception:  # noqa: BLE001 — index may not exist yet
                fulltext_hits = []
        return {"vector": vector_hits, "fulltext": fulltext_hits}

    def materialize_document(self, doc) -> dict[str, int]:
        """Project an ingested document into the knowledge graph. Idempotent."""
        with self._driver.session() as session:
            for statement, params in document_materialization_statements(doc):
                session.run(statement, params)
            counts = session.run(
                "MATCH (d:Document {source: $source})-[:MENTIONS]->(m) "
                "OPTIONAL MATCH (m)-[:REFERS_TO]->(t:Term) "
                "RETURN count(DISTINCT m) AS mentions, count(DISTINCT t) AS terms",
                {"source": doc.source},
            ).single()
        return {"mentions": counts["mentions"], "linked_terms": counts["terms"]}

    def import_rdf(self, turtle: str) -> dict[str, Any]:
        """Import RDF into Neo4j via the neosemantics (n10s) plugin.

        Gives the property graph an RDF view of the same semantic context —
        (:Resource {uri}) nodes with ontology URIs, connected by the original
        predicates. Requires n10s installed in the Neo4j instance.
        """
        with self._driver.session() as session:
            has_n10s = session.run(
                "SHOW PROCEDURES YIELD name WHERE name = 'n10s.rdf.import.inline' "
                "RETURN count(*) AS n"
            ).single()["n"]
            if not has_n10s:
                raise RuntimeError(
                    "neosemantics (n10s) is not installed in this Neo4j instance"
                )
            session.run(
                "CREATE CONSTRAINT n10s_unique_uri IF NOT EXISTS "
                "FOR (r:Resource) REQUIRE r.uri IS UNIQUE"
            )
            config_rows = session.run("CALL n10s.graphconfig.show()").data()
            if not config_rows:
                session.run("CALL n10s.graphconfig.init()")
            record = session.run(
                "CALL n10s.rdf.import.inline($ttl, 'Turtle')", {"ttl": turtle}
            ).single()
        return {
            "status": record["terminationStatus"],
            "triples_loaded": record["triplesLoaded"],
            "detail": record.get("extraInfo", "") if hasattr(record, "get") else "",
        }

    def explore(self, limit: int = 200) -> dict[str, Any]:
        """A bounded, real snapshot of the graph for visualization.

        Connected nodes and edges only — an isolated node contributes
        nothing to a relationship-centric view. Each node keeps its real
        label (Entity/Term/Document/Mention), a display name derived from
        whichever real property it actually has, and its full properties
        for an inspector panel.
        """
        with self._driver.session() as session:
            records = session.run(
                "MATCH (a)-[r]->(b) "
                "RETURN id(a) AS source_id, labels(a)[0] AS source_label, "
                "       properties(a) AS source_props, type(r) AS rel_type, "
                "       id(b) AS target_id, labels(b)[0] AS target_label, "
                "       properties(b) AS target_props "
                "LIMIT $limit",
                {"limit": limit},
            ).data()
        nodes: dict[int, dict[str, Any]] = {}
        edges: list[dict[str, Any]] = []
        for row in records:
            for prefix in ("source", "target"):
                node_id = row[f"{prefix}_id"]
                if node_id not in nodes:
                    props = row[f"{prefix}_props"]
                    name = (
                        props.get("name")
                        or props.get("term")
                        or props.get("title")
                        or props.get("id")
                        or str(node_id)
                    )
                    nodes[node_id] = {
                        "id": node_id,
                        "label": row[f"{prefix}_label"],
                        "name": name,
                        "properties": props,
                    }
            edges.append(
                {"source": row["source_id"], "target": row["target_id"], "type": row["rel_type"]}
            )
        return {"nodes": list(nodes.values()), "edges": edges}

    def run_cypher(self, query: str) -> list[dict[str, Any]]:
        """Execute read-only Cypher; raises ValueError for write queries."""
        violation = guard_cypher(query)
        if violation:
            raise ValueError(violation)
        with self._driver.session() as session:
            return [record.data() for record in session.run(query)]

    def close(self) -> None:
        self._driver.close()


def neo4j_configured() -> bool:
    return bool(os.environ.get("NEO4J_URI"))
