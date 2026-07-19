"""Ontology specialist's own tools -- self-contained bundled code, not a
reach-back into capabilities.py. Constructs its own GraphDBOntologyStore
the same zero-arg, env-var-driven way that class already works everywhere
else in this codebase."""

from __future__ import annotations


def build_tools() -> list:
    from langchain.tools import tool
    from polanyi.semantic.ontology import (
        GraphDBOntologyStore,
        graphdb_configured,
        guard_sparql,
    )

    if not graphdb_configured():
        raise RuntimeError("GraphDB not configured (GRAPHDB_ENDPOINT unset)")

    store = GraphDBOntologyStore()

    @tool
    def search_ontology(term: str) -> str:
        """Search FIBO ontology classes in GraphDB by business term.
        Returns matching ontology classes with labels, definitions, and scores."""
        return str(store.search_classes(term))

    @tool
    def expand_ontology(uri: str) -> str:
        """Expand an ontology class URI to all its transitive subclasses
        via rdfs:subClassOf* (deterministic, no LLM)."""
        return str(store.expand_subclasses(uri))

    @tool
    def query_ontology(sparql: str) -> str:
        """Run read-only SPARQL against the FIBO ontology repository on
        GraphDB. Write operations are rejected."""
        violation = guard_sparql(sparql)
        if violation:
            return f"QUERY BLOCKED: {violation}"
        try:
            rows = store.sparql_query(sparql)
        except Exception as exc:  # noqa: BLE001 -- surface driver errors to the model
            return f"Error: {exc}"
        return str(rows[:50])

    return [search_ontology, expand_ontology, query_ontology]
