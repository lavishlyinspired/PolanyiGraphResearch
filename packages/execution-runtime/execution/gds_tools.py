"""Graph Data Science algorithms over the materialized knowledge graph.

Each algorithm function projects an in-memory GDS graph, runs the algorithm,
and drops the projection in a `finally` block — GDS projections are not
automatically cleaned up and leak the JVM heap otherwise. The pure
`format_*` functions below (name resolution + ranking) are unit-testable
without a real GDS/Neo4j connection; the projection/streaming calls
themselves are thin wrappers, live-verified only — the same convention
`Neo4jGraphStore`'s driver-coupled methods already follow in this codebase.
"""

from __future__ import annotations

from typing import Any, Optional

_PROJECTED_LABELS = ["Entity", "Term", "Document", "Mention"]
_PROJECTED_RELATIONSHIP_TYPES = ["RELATES_TO", "DESCRIBES", "MENTIONS", "REFERS_TO"]


def format_page_rank(rows: list[dict[str, Any]], names: dict[int, str], top_n: int) -> list[dict[str, Any]]:
    """rows: [{'nodeId': int, 'score': float}, ...] from gds.pageRank.stream().
    A node with no resolvable real name falls back to its id, never a
    fabricated label."""
    ranked = sorted(rows, key=lambda r: r["score"], reverse=True)[:top_n]
    return [{"name": names.get(r["nodeId"], str(r["nodeId"])), "score": r["score"]} for r in ranked]


def format_communities(rows: list[dict[str, Any]], names: dict[int, str]) -> list[dict[str, Any]]:
    """rows: [{'nodeId': int, 'communityId': int}, ...] from gds.louvain.stream()."""
    grouped: dict[int, list[str]] = {}
    for row in rows:
        grouped.setdefault(row["communityId"], []).append(names.get(row["nodeId"], str(row["nodeId"])))
    return [{"community_id": cid, "members": members} for cid, members in sorted(grouped.items())]


def format_similar_terms(rows: list[dict[str, Any]], names: dict[int, str], top_n: int) -> list[dict[str, Any]]:
    """rows: [{'node1': int, 'node2': int, 'similarity': float}, ...] from gds.knn.stream()."""
    ranked = sorted(rows, key=lambda r: r["similarity"], reverse=True)[:top_n]
    return [
        {
            "term_a": names.get(row["node1"], str(row["node1"])),
            "term_b": names.get(row["node2"], str(row["node2"])),
            "similarity": row["similarity"],
        }
        for row in ranked
    ]


def gds_client_for_neo4j(connection_timeout: float = 2.0, max_retry_time: float = 2.0) -> Optional[Any]:
    """A GraphDataScience client for the same Neo4j Polanyi already connects
    to, or None if the package isn't installed, Neo4j is unreachable, or the
    GDS plugin isn't present server-side.

    `GraphDataScience.__init__` eagerly calls the equivalent of `gds.version()`
    to detect the server version — and that call runs through the neo4j
    driver's managed-transaction retry loop, which by default retries with
    exponential backoff for ~30s before giving up. A short `connection_timeout`
    alone does NOT bound this (verified: it only affects TCP connect, not the
    transaction-level retry loop) — `max_transaction_retry_time` does. Without
    both, an unreachable/misconfigured NEO4J_URI turns every capability-
    registry build into a 30+ second hang."""
    import os

    try:
        from graphdatascience import GraphDataScience
        from neo4j import GraphDatabase
    except ImportError:
        return None
    driver = GraphDatabase.driver(
        os.environ.get("NEO4J_URI", "neo4j://127.0.0.1:7687"),
        auth=(
            os.environ.get("NEO4J_USERNAME", "neo4j"),
            os.environ.get("NEO4J_PASSWORD", ""),
        ),
        connection_timeout=connection_timeout,
        max_transaction_retry_time=max_retry_time,
    )
    try:
        return GraphDataScience(driver, arrow=False)
    except Exception:  # noqa: BLE001 — unreachable Neo4j or GDS plugin absent
        driver.close()
        return None


def gds_plugin_available(gds: Any) -> bool:
    """Whether the GDS plugin is actually installed server-side — a working
    Neo4j connection alone doesn't guarantee this (Community Edition without
    the plugin has none)."""
    try:
        gds.version()
        return True
    except Exception:  # noqa: BLE001 — availability probe
        return False


def _resolve_names(gds: Any, node_ids: list[int]) -> dict[int, str]:
    """Real node names for a set of internal Neo4j ids — never fabricated
    for an id that doesn't correspond to a real node."""
    if not node_ids:
        return {}
    df = gds.run_cypher(
        "MATCH (n) WHERE id(n) IN $ids "
        "RETURN id(n) AS nodeId, coalesce(n.name, n.term, n.title, n.id) AS name",
        {"ids": list(node_ids)},
    )
    return dict(zip(df["nodeId"], df["name"]))


def page_rank(gds: Any, top_n: int = 10) -> list[dict[str, Any]]:
    """Rank entities/terms in the knowledge graph by structural importance."""
    graph, _ = gds.graph.project("polanyi-pagerank", _PROJECTED_LABELS, _PROJECTED_RELATIONSHIP_TYPES)
    try:
        result = gds.pageRank.stream(graph)
    finally:
        graph.drop()
    rows = result.to_dict("records")
    names = _resolve_names(gds, [r["nodeId"] for r in rows])
    return format_page_rank(rows, names, top_n)


def find_communities(gds: Any) -> list[dict[str, Any]]:
    """Group entities/terms into real communities (Louvain modularity)."""
    graph, _ = gds.graph.project("polanyi-communities", _PROJECTED_LABELS, _PROJECTED_RELATIONSHIP_TYPES)
    try:
        result = gds.louvain.stream(graph)
    finally:
        graph.drop()
    rows = result.to_dict("records")
    names = _resolve_names(gds, [r["nodeId"] for r in rows])
    return format_communities(rows, names)


def find_similar_terms(gds: Any, top_n: int = 10) -> list[dict[str, Any]]:
    """KNN similarity over Term.embedding (written during materialize() when
    an embedding provider is configured — S17). Returns an honest empty list,
    not fabricated pairs, when no Term has an embedding yet."""
    embedded_count = gds.run_cypher("MATCH (t:Term) WHERE t.embedding IS NOT NULL RETURN count(t) AS c")["c"][0]
    if embedded_count == 0:
        return []
    graph, _ = gds.graph.project("polanyi-similarity", {"Term": {"properties": ["embedding"]}}, "*")
    try:
        result = gds.knn.stream(graph, nodeProperties=["embedding"], topK=top_n)
    finally:
        graph.drop()
    rows = result.to_dict("records")
    names = _resolve_names(gds, [r["node1"] for r in rows] + [r["node2"] for r in rows])
    return format_similar_terms(rows, names, top_n)
