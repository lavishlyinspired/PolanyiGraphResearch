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

from graphos.models import SemanticContext

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


class Neo4jGraphStore:
    def __init__(
        self,
        uri: Optional[str] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
    ):
        from neo4j import GraphDatabase

        self._driver = GraphDatabase.driver(
            uri or os.environ.get("NEO4J_URI", "neo4j://127.0.0.1:7687"),
            auth=(
                username or os.environ.get("NEO4J_USERNAME", "neo4j"),
                password or os.environ.get("NEO4J_PASSWORD", ""),
            ),
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
        return {
            "entities": counts["entities"],
            "terms": counts["terms"],
            "relationships": counts["rels"],
        }

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
