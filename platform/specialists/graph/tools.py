"""Graph specialist's own tools -- self-contained bundled code, not a
reach-back into capabilities.py. Constructs its own Neo4jGraphStore the
same zero-arg, env-var-driven way that class already works everywhere
else in this codebase. Relocated (not rewritten) from capabilities.py's
former neo4j_configured() block."""

from __future__ import annotations

from typing import Any


def _describe_graph_schema(store: Any) -> str:
    """Real, live node-label and relationship-type list for a tool description --
    not a hardcoded guess that goes stale as the graph schema evolves."""
    try:
        labels = [r["label"] for r in store.run_cypher("CALL db.labels() YIELD label RETURN label")]
        rel_types = [
            r["relationshipType"]
            for r in store.run_cypher("CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType")
        ]
        return f"Node labels: {', '.join(sorted(labels))}. Relationship types: {', '.join(sorted(rel_types))}."
    except Exception:  # noqa: BLE001 -- schema introspection is best-effort
        return "Schema unavailable."
    finally:
        store.close()


def merge_search_hits(
    vector_hits: list[dict[str, Any]], fulltext_hits: list[dict[str, Any]], top_k: int
) -> list[dict[str, Any]]:
    """Combine real vector + fulltext hits by term. A term found by only one
    leg gets a real 0.0 for the other (never a fabricated score) -- this is
    what makes hybrid search "hybrid" rather than picking one leg silently."""
    combined: dict[str, dict[str, Any]] = {}
    for hit in vector_hits:
        entry = combined.setdefault(hit["term"], {"term": hit["term"], "vector_score": 0.0, "fulltext_score": 0.0})
        entry["vector_score"] = hit["score"]
    for hit in fulltext_hits:
        entry = combined.setdefault(hit["term"], {"term": hit["term"], "vector_score": 0.0, "fulltext_score": 0.0})
        entry["fulltext_score"] = hit["score"]
    for entry in combined.values():
        entry["combined_score"] = entry["vector_score"] + entry["fulltext_score"]
    ranked = sorted(combined.values(), key=lambda e: e["combined_score"], reverse=True)
    return ranked[:top_k]


def build_tools() -> list:
    from langchain.tools import tool
    from polanyi.execution.knowledge_graph import Neo4jGraphStore, guard_cypher, neo4j_configured

    if not neo4j_configured():
        raise RuntimeError("Neo4j not configured (NEO4J_URI unset)")

    @tool
    def query_knowledge_graph(cypher: str) -> str:
        """Run read-only Cypher against the enterprise knowledge graph.
        Write operations are rejected."""
        violation = guard_cypher(cypher)
        if violation:
            return f"QUERY BLOCKED: {violation}"
        store = Neo4jGraphStore()
        try:
            count = store.run_cypher("MATCH (n) RETURN count(n) AS c")[0]["c"]
            if count == 0:
                return (
                    "The knowledge graph has not been materialized yet — no "
                    "nodes exist. Materialize it first, then query again."
                )
            rows = store.run_cypher(cypher)
        except Exception as exc:  # noqa: BLE001 -- surface driver errors to the model
            return f"Error: {exc}"
        finally:
            store.close()
        return str(rows[:50])

    query_knowledge_graph.description = (
        f"Run read-only Cypher against the enterprise knowledge graph. "
        f"{_describe_graph_schema(Neo4jGraphStore())} Write operations are rejected."
    )

    @tool
    def search_knowledge_graph(query: str, top_k: int = 5) -> str:
        """Semantic + lexical search over the enterprise knowledge graph.
        Finds Term nodes matching `query` by meaning (vector, when an
        embedding provider is configured) and text (fulltext, always)."""
        from polanyi.semantic.embeddings import resolve_embedding_provider

        provider = resolve_embedding_provider()
        query_vector = provider.embed([query])[0] if provider is not None else None
        search_store = Neo4jGraphStore()
        try:
            hits = search_store.hybrid_search(query_vector, query, top_k)
        except Exception as exc:  # noqa: BLE001 -- surface driver errors to the model
            return f"Error: {exc}"
        finally:
            search_store.close()
        merged = merge_search_hits(hits["vector"], hits["fulltext"], top_k)
        if not merged:
            return "No matching terms found via semantic or lexical search."
        return "\n".join(f"{h['term']} (score: {h['combined_score']:.2f})" for h in merged)

    tools = [query_knowledge_graph, search_knowledge_graph]

    from polanyi.execution.gds_tools import gds_client_for_neo4j, gds_plugin_available

    gds = gds_client_for_neo4j()
    if gds is not None and gds_plugin_available(gds):
        from polanyi.execution.gds_tools import find_communities, page_rank
        from polanyi.execution.gds_tools import find_similar_terms as gds_find_similar_terms

        @tool
        def graph_page_rank(top_n: int = 10) -> str:
            """Rank entities and terms in the knowledge graph by structural
            importance (PageRank). Use to find the most central concepts."""
            results = page_rank(gds, top_n)
            if not results:
                return "No results — the knowledge graph may be empty."
            return "\n".join(f"{r['name']} (score: {r['score']:.3f})" for r in results)

        @tool
        def find_graph_communities() -> str:
            """Group entities and terms in the knowledge graph into real
            clusters (Louvain community detection) — finds groups of
            closely related concepts."""
            results = find_communities(gds)
            if not results:
                return "No communities found — the knowledge graph may be empty."
            return "\n".join(f"Community {c['community_id']}: {', '.join(c['members'])}" for c in results)

        @tool
        def find_similar_terms(top_n: int = 10) -> str:
            """Find pairs of glossary terms with similar meaning (KNN over
            real term embeddings — requires an embedding provider to have
            been configured when the graph was materialized)."""
            results = gds_find_similar_terms(gds, top_n)
            if not results:
                return (
                    "No term embeddings exist yet — configure "
                    "POLANYI_EMBEDDING_PROVIDER and re-materialize the graph first."
                )
            return "\n".join(f"{r['term_a']} ~ {r['term_b']} (similarity: {r['similarity']:.3f})" for r in results)

        tools += [graph_page_rank, find_graph_communities, find_similar_terms]

    from polanyi.execution.graphrag_pipeline import graph_rag_query as _graph_rag_query

    @tool
    def graph_rag_query(question: str) -> str:
        """Answer a question using GraphRAG over the enterprise knowledge
        graph: semantic + lexical retrieval over glossary terms, grounded
        by their real entity/document relationships, then LLM generation.
        Degrades honestly (no fabricated answer) if no LLM is configured
        or the graph hasn't been materialized with search indexes yet."""
        return _graph_rag_query(question)

    tools.append(graph_rag_query)

    return tools
