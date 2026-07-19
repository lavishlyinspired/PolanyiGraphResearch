"""Tests for platform/specialists/graph/tools.py -- loaded the same way
packages.kernel.specialists.load_specialists() loads it (dynamic import),
mirroring test_ontology_specialist_tools.py's convention. Carries forward
the exact behavior coverage these 6 tools already had in test_capabilities.py
before S22 relocated them out of capabilities.py into this self-contained
specialist folder."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

_TOOLS_PATH = Path("platform/specialists/graph/tools.py")


def _load_graph_tools_module():
    spec = importlib.util.spec_from_file_location("test_graph_specialist_tools_module", _TOOLS_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class _FakeNeo4jStore:
    def __init__(self, node_count, labels, rel_types, query_result=None):
        self.node_count = node_count
        self.labels = labels
        self.rel_types = rel_types
        self.query_result = query_result if query_result is not None else []
        self.close_count = 0
        self.queries_run: list[str] = []

    def run_cypher(self, query):
        self.queries_run.append(query)
        if "count(n)" in query:
            return [{"c": self.node_count}]
        if "db.labels" in query:
            return [{"label": label} for label in self.labels]
        if "db.relationshipTypes" in query:
            return [{"relationshipType": rt} for rt in self.rel_types]
        return self.query_result

    def close(self):
        self.close_count += 1


class _FakeHybridStore:
    def __init__(self, vector_hits=None, fulltext_hits=None):
        self.vector_hits = vector_hits if vector_hits is not None else []
        self.fulltext_hits = fulltext_hits if fulltext_hits is not None else []
        self.last_query_vector = "not called"
        self.closed = False

    def hybrid_search(self, query_vector, query_text, top_k):
        self.last_query_vector = query_vector
        return {"vector": self.vector_hits, "fulltext": self.fulltext_hits}

    def close(self):
        self.closed = True


class _FakeGds:
    def __init__(self, page_rank_rows=None, community_rows=None, similar_rows=None, embedded_count=0):
        self._page_rank_rows = page_rank_rows or []
        self._community_rows = community_rows or []
        self._similar_rows = similar_rows or []
        self._embedded_count = embedded_count
        self.dropped_graphs: list[str] = []

    def version(self):
        return "2026.3.0"

    class _FakeGraph:
        def __init__(self, name, tracker):
            self.name = name
            self._tracker = tracker

        def drop(self):
            self._tracker.append(self.name)

    class _FakeAlgo:
        def __init__(self, rows):
            self._rows = rows

        def stream(self, graph, **kwargs):
            import pandas as pd

            return pd.DataFrame(self._rows)

    @property
    def graph(self):
        outer = self

        class _Proj:
            def project(self, name, *args, **kwargs):
                return outer._FakeGraph(name, outer.dropped_graphs), {"nodeCount": 1}

        return _Proj()

    @property
    def pageRank(self):
        return self._FakeAlgo(self._page_rank_rows)

    @property
    def louvain(self):
        return self._FakeAlgo(self._community_rows)

    @property
    def knn(self):
        return self._FakeAlgo(self._similar_rows)

    def run_cypher(self, query, params=None):
        import pandas as pd

        if "count(t)" in query:
            return pd.DataFrame([{"c": self._embedded_count}])
        ids = (params or {}).get("ids", [])
        return pd.DataFrame([{"nodeId": i, "name": f"node-{i}"} for i in ids])


def _configure_neo4j(monkeypatch, store):
    import polanyi.execution.knowledge_graph as kg_module

    monkeypatch.setattr(kg_module, "neo4j_configured", lambda: True)
    monkeypatch.setattr(kg_module, "Neo4jGraphStore", lambda **kwargs: store)


def _configure_gds(monkeypatch, gds):
    import polanyi.execution.gds_tools as gds_module

    monkeypatch.setattr(gds_module, "gds_client_for_neo4j", lambda: gds)


def _configure_graphrag(monkeypatch, fn):
    import polanyi.execution.graphrag_pipeline as graphrag_module

    monkeypatch.setattr(graphrag_module, "graph_rag_query", fn)


# ── build_tools gating ─────────────────────────────────────────────


def test_build_tools_raises_when_neo4j_not_configured(monkeypatch):
    import polanyi.execution.knowledge_graph as kg_module

    monkeypatch.setattr(kg_module, "neo4j_configured", lambda: False)
    module = _load_graph_tools_module()
    with pytest.raises(RuntimeError):
        module.build_tools()


def test_build_tools_returns_all_six_when_gds_available(monkeypatch):
    _configure_neo4j(monkeypatch, _FakeNeo4jStore(node_count=1, labels=[], rel_types=[]))
    _configure_gds(monkeypatch, _FakeGds())
    module = _load_graph_tools_module()
    names = {t.name for t in module.build_tools()}
    assert names == {
        "query_knowledge_graph",
        "search_knowledge_graph",
        "graph_page_rank",
        "find_graph_communities",
        "find_similar_terms",
        "graph_rag_query",
    }


def test_build_tools_omits_gds_tools_when_plugin_unavailable(monkeypatch):
    _configure_neo4j(monkeypatch, _FakeNeo4jStore(node_count=1, labels=[], rel_types=[]))
    _configure_gds(monkeypatch, None)
    module = _load_graph_tools_module()
    names = {t.name for t in module.build_tools()}
    assert "graph_page_rank" not in names
    assert "find_graph_communities" not in names
    assert "find_similar_terms" not in names
    assert {"query_knowledge_graph", "search_knowledge_graph", "graph_rag_query"} <= names


def test_build_tools_omits_gds_tools_when_plugin_not_installed_server_side(monkeypatch):
    _configure_neo4j(monkeypatch, _FakeNeo4jStore(node_count=1, labels=[], rel_types=[]))

    class BrokenGds(_FakeGds):
        def version(self):
            raise RuntimeError("gds.version unknown procedure")

    _configure_gds(monkeypatch, BrokenGds())
    module = _load_graph_tools_module()
    names = {t.name for t in module.build_tools()}
    assert "graph_page_rank" not in names


# ── merge_search_hits (pure function, relocated from capabilities.py) ──


def test_merge_search_hits_combines_scores_for_a_term_matched_by_both_legs():
    module = _load_graph_tools_module()
    vector_hits = [{"term": "Counterparty", "score": 0.9}]
    fulltext_hits = [{"term": "Counterparty", "score": 0.4}]
    merged = module.merge_search_hits(vector_hits, fulltext_hits, top_k=5)
    assert merged == [{"term": "Counterparty", "vector_score": 0.9, "fulltext_score": 0.4, "combined_score": 1.3}]


def test_merge_search_hits_never_fabricates_a_term_absent_from_both_legs():
    module = _load_graph_tools_module()
    merged = module.merge_search_hits([{"term": "A", "score": 0.5}], [{"term": "B", "score": 0.5}], top_k=5)
    terms = {m["term"] for m in merged}
    assert terms == {"A", "B"}


def test_merge_search_hits_gives_a_fulltext_only_term_zero_vector_score_not_a_fabricated_one():
    module = _load_graph_tools_module()
    merged = module.merge_search_hits([], [{"term": "Trade", "score": 0.6}], top_k=5)
    assert merged == [{"term": "Trade", "vector_score": 0.0, "fulltext_score": 0.6, "combined_score": 0.6}]


def test_merge_search_hits_respects_top_k_and_ranks_by_combined_score_descending():
    module = _load_graph_tools_module()
    vector_hits = [{"term": "Low", "score": 0.1}, {"term": "High", "score": 0.9}]
    merged = module.merge_search_hits(vector_hits, [], top_k=1)
    assert merged == [{"term": "High", "vector_score": 0.9, "fulltext_score": 0.0, "combined_score": 0.9}]


# ── query_knowledge_graph ────────────────────────────────────────


def test_query_knowledge_graph_description_reflects_the_real_live_schema(monkeypatch):
    store = _FakeNeo4jStore(node_count=5, labels=["Widget", "Gadget"], rel_types=["OWNS", "CONTAINS"])
    _configure_neo4j(monkeypatch, store)
    _configure_gds(monkeypatch, None)
    module = _load_graph_tools_module()
    tool = next(t for t in module.build_tools() if t.name == "query_knowledge_graph")
    assert "Node labels: Gadget, Widget" in tool.description
    assert "Relationship types: CONTAINS, OWNS" in tool.description


def test_query_knowledge_graph_degrades_honestly_when_schema_introspection_fails(monkeypatch):
    class BoomStore:
        def run_cypher(self, query):
            raise RuntimeError("connection reset")

        def close(self):
            pass

    _configure_neo4j(monkeypatch, BoomStore())
    _configure_gds(monkeypatch, None)
    module = _load_graph_tools_module()
    tool = next(t for t in module.build_tools() if t.name == "query_knowledge_graph")
    assert "unavailable" in tool.description.lower()


def test_query_knowledge_graph_rejects_write_cypher(monkeypatch):
    store = _FakeNeo4jStore(node_count=5, labels=["Entity"], rel_types=["DESCRIBES"])
    _configure_neo4j(monkeypatch, store)
    _configure_gds(monkeypatch, None)
    module = _load_graph_tools_module()
    tool = next(t for t in module.build_tools() if t.name == "query_knowledge_graph")
    result = tool.invoke({"cypher": "CREATE (n:Rogue) RETURN n"})
    assert "BLOCKED" in result


def test_query_knowledge_graph_returns_an_honest_message_when_the_graph_is_empty(monkeypatch):
    store = _FakeNeo4jStore(node_count=0, labels=[], rel_types=[])
    _configure_neo4j(monkeypatch, store)
    _configure_gds(monkeypatch, None)
    module = _load_graph_tools_module()
    tool = next(t for t in module.build_tools() if t.name == "query_knowledge_graph")
    queries_before_call = len(store.queries_run)
    result = tool.invoke({"cypher": "MATCH (n:Term) RETURN n LIMIT 5"})
    assert "materializ" in result.lower()
    assert len(store.queries_run) == queries_before_call + 1
    assert "count(n)" in store.queries_run[-1]


def test_query_knowledge_graph_runs_the_real_query_when_the_graph_has_nodes(monkeypatch):
    store = _FakeNeo4jStore(
        node_count=12, labels=["Entity"], rel_types=["DESCRIBES"], query_result=[{"t.term": "Counterparty"}]
    )
    _configure_neo4j(monkeypatch, store)
    _configure_gds(monkeypatch, None)
    module = _load_graph_tools_module()
    tool = next(t for t in module.build_tools() if t.name == "query_knowledge_graph")
    result = tool.invoke({"cypher": "MATCH (t:Term) RETURN t.term LIMIT 5"})
    assert "Counterparty" in result


def test_query_knowledge_graph_closes_the_connection_after_a_real_query(monkeypatch):
    store = _FakeNeo4jStore(node_count=3, labels=["Entity"], rel_types=["DESCRIBES"], query_result=[{"n": 1}])
    _configure_neo4j(monkeypatch, store)
    _configure_gds(monkeypatch, None)
    module = _load_graph_tools_module()
    tool = next(t for t in module.build_tools() if t.name == "query_knowledge_graph")
    closes_before_call = store.close_count
    tool.invoke({"cypher": "MATCH (n) RETURN n LIMIT 1"})
    assert store.close_count == closes_before_call + 1


def test_query_knowledge_graph_closes_the_connection_even_when_the_graph_is_empty(monkeypatch):
    store = _FakeNeo4jStore(node_count=0, labels=[], rel_types=[])
    _configure_neo4j(monkeypatch, store)
    _configure_gds(monkeypatch, None)
    module = _load_graph_tools_module()
    tool = next(t for t in module.build_tools() if t.name == "query_knowledge_graph")
    closes_before_call = store.close_count
    tool.invoke({"cypher": "MATCH (n) RETURN n LIMIT 1"})
    assert store.close_count == closes_before_call + 1


# ── search_knowledge_graph ───────────────────────────────────────


def test_search_knowledge_graph_runs_fulltext_only_without_a_configured_embedding_provider(monkeypatch):
    import polanyi.semantic.embeddings as embeddings_module

    monkeypatch.setattr(embeddings_module, "resolve_embedding_provider", lambda: None)
    fake_store = _FakeHybridStore(fulltext_hits=[{"term": "Counterparty", "score": 0.7}])
    _configure_neo4j(monkeypatch, fake_store)
    _configure_gds(monkeypatch, None)

    module = _load_graph_tools_module()
    tool = next(t for t in module.build_tools() if t.name == "search_knowledge_graph")
    result = tool.invoke({"query": "counterparty"})

    assert fake_store.last_query_vector is None
    assert "Counterparty" in result


def test_search_knowledge_graph_embeds_the_query_when_a_provider_is_configured(monkeypatch):
    import polanyi.semantic.embeddings as embeddings_module

    class FakeProvider:
        def embed(self, texts):
            return [[0.1, 0.2, 0.3] for _ in texts]

    monkeypatch.setattr(embeddings_module, "resolve_embedding_provider", lambda: FakeProvider())
    fake_store = _FakeHybridStore(vector_hits=[{"term": "Trade", "score": 0.95}])
    _configure_neo4j(monkeypatch, fake_store)
    _configure_gds(monkeypatch, None)

    module = _load_graph_tools_module()
    tool = next(t for t in module.build_tools() if t.name == "search_knowledge_graph")
    result = tool.invoke({"query": "trade"})

    assert fake_store.last_query_vector == [0.1, 0.2, 0.3]
    assert "Trade" in result


def test_search_knowledge_graph_reports_honestly_when_nothing_matches(monkeypatch):
    import polanyi.semantic.embeddings as embeddings_module

    monkeypatch.setattr(embeddings_module, "resolve_embedding_provider", lambda: None)
    fake_store = _FakeHybridStore()
    _configure_neo4j(monkeypatch, fake_store)
    _configure_gds(monkeypatch, None)

    module = _load_graph_tools_module()
    tool = next(t for t in module.build_tools() if t.name == "search_knowledge_graph")
    result = tool.invoke({"query": "nonexistent"})
    assert "no matching" in result.lower()


# ── GDS tools ────────────────────────────────────────────────────


def test_graph_page_rank_tool_returns_real_ranked_results(monkeypatch):
    _configure_neo4j(monkeypatch, _FakeNeo4jStore(node_count=1, labels=[], rel_types=[]))
    gds = _FakeGds(page_rank_rows=[{"nodeId": 1, "score": 0.9}, {"nodeId": 2, "score": 0.2}])
    _configure_gds(monkeypatch, gds)
    module = _load_graph_tools_module()
    tool = next(t for t in module.build_tools() if t.name == "graph_page_rank")
    result = tool.invoke({"top_n": 5})
    assert "node-1" in result
    assert gds.dropped_graphs == ["polanyi-pagerank"]


def test_find_similar_terms_tool_reports_honestly_when_no_embeddings_exist(monkeypatch):
    _configure_neo4j(monkeypatch, _FakeNeo4jStore(node_count=1, labels=[], rel_types=[]))
    gds = _FakeGds(embedded_count=0)
    _configure_gds(monkeypatch, gds)
    module = _load_graph_tools_module()
    tool = next(t for t in module.build_tools() if t.name == "find_similar_terms")
    result = tool.invoke({"top_n": 5})
    assert "no term embeddings" in result.lower()


# ── graph_rag_query ──────────────────────────────────────────────


def test_graph_rag_query_tool_calls_through_to_the_real_pipeline_function(monkeypatch):
    _configure_neo4j(monkeypatch, _FakeNeo4jStore(node_count=1, labels=[], rel_types=[]))
    _configure_gds(monkeypatch, None)
    _configure_graphrag(monkeypatch, lambda question: f"answered: {question}")
    module = _load_graph_tools_module()
    tool = next(t for t in module.build_tools() if t.name == "graph_rag_query")
    result = tool.invoke({"question": "What is a Counterparty?"})
    assert result == "answered: What is a Counterparty?"
