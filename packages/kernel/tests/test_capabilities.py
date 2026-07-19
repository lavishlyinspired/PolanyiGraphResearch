import pytest

from polanyi.kernel.capabilities import (
    CapabilityNotFound,
    CapabilityProvider,
    CapabilityRegistry,
    default_registry,
)
from polanyi.demo import DEMO_BUSINESS_RULES, seed_demo_db
from polanyi.semantic.generate import build_rule_contexts


@pytest.fixture()
def demo_uri(tmp_path):
    db_path = tmp_path / "demo.db"
    seed_demo_db(str(db_path))
    return f"sqlite:///{db_path}"


@pytest.fixture(autouse=True)
def _no_real_gds_by_default(monkeypatch):
    """Tests that merely set a fake NEO4J_URI (to exercise other Neo4j tools)
    would otherwise trigger a real GraphDataScience connection attempt during
    default_registry() -- construction eagerly calls the server-version
    equivalent of gds.version(), which retries for real before failing.
    GDS-specific tests below override this via _configure_fake_gds."""
    import polanyi.execution.gds_tools as gds_module

    monkeypatch.setattr(gds_module, "gds_client_for_neo4j", lambda: None)


def test_register_and_resolve_returns_provider():
    registry = CapabilityRegistry()
    provider = CapabilityProvider(
        name="echo",
        capability="Echo",
        kind="function",
        description="echoes input",
        handler=lambda x: x,
    )
    registry.register(provider)
    assert registry.resolve("Echo").name == "echo"


def test_resolve_unknown_capability_raises():
    registry = CapabilityRegistry()
    with pytest.raises(CapabilityNotFound):
        registry.resolve("RunCypher")


def test_resolve_prefers_named_provider_over_registration_order():
    registry = CapabilityRegistry()
    for name in ("first", "second"):
        registry.register(
            CapabilityProvider(
                name=name,
                capability="ExecuteSQL",
                kind="function",
                description=name,
                handler=lambda x: x,
            )
        )
    assert registry.resolve("ExecuteSQL").name == "first"
    assert registry.resolve("ExecuteSQL", prefer="second").name == "second"


def test_catalog_is_serializable_and_hides_handlers():
    registry = CapabilityRegistry()
    registry.register(
        CapabilityProvider(
            name="echo",
            capability="Echo",
            kind="function",
            description="echoes input",
            handler=lambda x: x,
            metadata={"latency": "low"},
        )
    )
    catalog = registry.catalog()
    assert catalog == [
        {
            "capability": "Echo",
            "name": "echo",
            "kind": "function",
            "description": "echoes input",
            "metadata": {"latency": "low"},
        }
    ]


def test_default_registry_advertises_core_capabilities(demo_uri):
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    assert {
        "DiscoverMetadata",
        "ListTables",
        "InspectSchema",
        "ExecuteSQL",
        "ValidateSQL",
    } <= set(registry.capabilities())


def test_default_registry_execute_sql_goes_through_rule_guard(demo_uri):
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    tool = registry.resolve("ExecuteSQL").handler
    blocked = tool.invoke(
        {
            "query": "SELECT t.trade_id FROM trades t "
            "JOIN counterparties c ON t.counterparty_id = c.counterparty_id"
        }
    )
    assert "BLOCKED" in blocked
    clean = tool.invoke({"query": "SELECT COUNT(*) FROM instruments"})
    assert "3" in clean


def test_default_registry_agent_tools_include_the_sql_toolset(demo_uri):
    """Plugged skills (agent_tool: true) may add tools; the guarded SQL
    toolset must always be present."""
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    names = {t.name for t in registry.agent_tools()}
    assert {"sql_db_list_tables", "sql_db_schema", "sql_db_query"} <= names


def test_default_registry_reports_validation_events(demo_uri):
    events = []
    registry = default_registry(
        demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES), on_event=events.append
    )
    registry.resolve("ExecuteSQL").handler.invoke({"query": "DELETE FROM trades"})
    assert any(e.kind == "validation" and e.name == "blocked" for e in events)


def _configure_fake_graphdb(monkeypatch, search_result=None, expand_result=None, sparql_result=None):
    """Real gap this closes: SearchOntology/ExpandOntology were registered as
    kind='function' (invisible to the agent's tool list) even when GraphDB is
    configured -- promote them to kind='tool', matching query_knowledge_graph's
    existing Neo4j pattern."""
    import polanyi.semantic.ontology as ontology_module

    class FakeStore:
        repository = "fibo-prod"

        def search_classes(self, term):
            return search_result if search_result is not None else [f"matched:{term}"]

        def expand_subclasses(self, uri):
            return expand_result if expand_result is not None else [f"expanded:{uri}"]

        def sparql_query(self, query):
            return sparql_result if sparql_result is not None else [{"queried": query}]

    monkeypatch.setattr(ontology_module, "graphdb_configured", lambda: True)
    monkeypatch.setattr(ontology_module, "GraphDBOntologyStore", lambda: FakeStore())


def test_default_registry_promotes_ontology_search_to_an_agent_tool_when_graphdb_configured(demo_uri, monkeypatch):
    _configure_fake_graphdb(monkeypatch)
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    names = {t.name for t in registry.agent_tools()}
    assert {"search_ontology", "expand_ontology"} <= names


def test_default_registry_omits_ontology_tools_when_graphdb_unconfigured(demo_uri, monkeypatch):
    import polanyi.semantic.ontology as ontology_module

    monkeypatch.setattr(ontology_module, "graphdb_configured", lambda: False)
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    names = {t.name for t in registry.agent_tools()}
    assert "search_ontology" not in names
    assert "expand_ontology" not in names


def test_search_ontology_tool_calls_through_to_the_real_store(demo_uri, monkeypatch):
    _configure_fake_graphdb(monkeypatch, search_result=["fibo:Counterparty"])
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    tool = next(t for t in registry.agent_tools() if t.name == "search_ontology")
    assert "fibo:Counterparty" in tool.invoke({"term": "Counterparty"})


def test_expand_ontology_tool_calls_through_to_the_real_store(demo_uri, monkeypatch):
    _configure_fake_graphdb(monkeypatch, expand_result=["fibo:Bond", "fibo:MunicipalBond"])
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    tool = next(t for t in registry.agent_tools() if t.name == "expand_ontology")
    result = tool.invoke({"uri": "https://fibo/Bond"})
    assert "fibo:Bond" in result


# ── SPARQL agent tool (Phase 5.2) ──────────────────────────────────


def test_query_ontology_tool_registered_when_graphdb_configured(demo_uri, monkeypatch):
    _configure_fake_graphdb(monkeypatch)
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    names = {t.name for t in registry.agent_tools()}
    assert "query_ontology" in names


def test_query_ontology_tool_omitted_when_graphdb_unconfigured(demo_uri, monkeypatch):
    import polanyi.semantic.ontology as ontology_module

    monkeypatch.setattr(ontology_module, "graphdb_configured", lambda: False)
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    names = {t.name for t in registry.agent_tools()}
    assert "query_ontology" not in names


def test_query_ontology_tool_rejects_write_sparql(demo_uri, monkeypatch):
    _configure_fake_graphdb(monkeypatch)
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    tool = next(t for t in registry.agent_tools() if t.name == "query_ontology")
    result = tool.invoke({"sparql": "INSERT DATA { <urn:x> <urn:y> <urn:z> }"})
    assert "BLOCKED" in result


def test_query_ontology_tool_calls_through_to_the_real_store(demo_uri, monkeypatch):
    _configure_fake_graphdb(monkeypatch, sparql_result=[{"class": "fibo:Bond"}])
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    tool = next(t for t in registry.agent_tools() if t.name == "query_ontology")
    result = tool.invoke({"sparql": "SELECT ?class WHERE { ?class a owl:Class }"})
    assert "fibo:Bond" in result


class _FakeNeo4jStore:
    """Routes canned responses by query shape -- mirrors the real Neo4jGraphStore's
    contract (run_cypher raises ValueError for write/unsafe Cypher via guard_cypher,
    which the real store also enforces; this fake skips that since capabilities.py's
    own guard_cypher call already gates before reaching the store)."""

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


def _configure_fake_neo4j(monkeypatch, store):
    import polanyi.execution.knowledge_graph as kg_module

    monkeypatch.setenv("NEO4J_URI", "neo4j://fake:7687")
    monkeypatch.setattr(kg_module, "Neo4jGraphStore", lambda **kwargs: store)


def test_query_knowledge_graph_description_reflects_the_real_live_schema(demo_uri, monkeypatch):
    # Labels/rel types deliberately don't overlap with the old hardcoded
    # docstring text (Entity/Term/DESCRIBES/RELATES_TO) -- otherwise this
    # test would pass against a static description by coincidence.
    store = _FakeNeo4jStore(node_count=5, labels=["Widget", "Gadget"], rel_types=["OWNS", "CONTAINS"])
    _configure_fake_neo4j(monkeypatch, store)
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    tool = next(t for t in registry.agent_tools() if t.name == "query_knowledge_graph")
    # Position-aware: labels must appear under "Node labels", not swapped with
    # relationship types under the wrong heading.
    assert "Node labels: Gadget, Widget" in tool.description
    assert "Relationship types: CONTAINS, OWNS" in tool.description


def test_query_knowledge_graph_degrades_honestly_when_schema_introspection_fails(demo_uri, monkeypatch):
    import polanyi.execution.knowledge_graph as kg_module

    class BoomStore:
        def run_cypher(self, query):
            raise RuntimeError("connection reset")

        def close(self):
            pass

    monkeypatch.setenv("NEO4J_URI", "neo4j://fake:7687")
    monkeypatch.setattr(kg_module, "Neo4jGraphStore", lambda **kwargs: BoomStore())
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    tool = next(t for t in registry.agent_tools() if t.name == "query_knowledge_graph")
    assert "unavailable" in tool.description.lower()


def test_query_knowledge_graph_rejects_write_cypher(demo_uri, monkeypatch):
    store = _FakeNeo4jStore(node_count=5, labels=["Entity"], rel_types=["DESCRIBES"])
    _configure_fake_neo4j(monkeypatch, store)
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    tool = next(t for t in registry.agent_tools() if t.name == "query_knowledge_graph")
    result = tool.invoke({"cypher": "CREATE (n:Rogue) RETURN n"})
    assert "BLOCKED" in result


def test_query_knowledge_graph_returns_an_honest_message_when_the_graph_is_empty(demo_uri, monkeypatch):
    store = _FakeNeo4jStore(node_count=0, labels=[], rel_types=[])
    _configure_fake_neo4j(monkeypatch, store)
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    tool = next(t for t in registry.agent_tools() if t.name == "query_knowledge_graph")
    queries_before_call = len(store.queries_run)
    result = tool.invoke({"cypher": "MATCH (n:Term) RETURN n LIMIT 5"})
    assert "materializ" in result.lower()
    # Only the count check ran -- the user's Cypher must never reach the store
    # once we already know the graph is empty.
    assert len(store.queries_run) == queries_before_call + 1
    assert "count(n)" in store.queries_run[-1]


def test_query_knowledge_graph_runs_the_real_query_when_the_graph_has_nodes(demo_uri, monkeypatch):
    store = _FakeNeo4jStore(
        node_count=12,
        labels=["Entity"],
        rel_types=["DESCRIBES"],
        query_result=[{"t.term": "Counterparty"}],
    )
    _configure_fake_neo4j(monkeypatch, store)
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    tool = next(t for t in registry.agent_tools() if t.name == "query_knowledge_graph")
    result = tool.invoke({"cypher": "MATCH (t:Term) RETURN t.term LIMIT 5"})
    assert "Counterparty" in result


def test_query_knowledge_graph_closes_the_connection_after_a_real_query(demo_uri, monkeypatch):
    store = _FakeNeo4jStore(node_count=3, labels=["Entity"], rel_types=["DESCRIBES"], query_result=[{"n": 1}])
    _configure_fake_neo4j(monkeypatch, store)
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    tool = next(t for t in registry.agent_tools() if t.name == "query_knowledge_graph")
    closes_before_call = store.close_count  # registration's schema lookup already closed once
    tool.invoke({"cypher": "MATCH (n) RETURN n LIMIT 1"})
    assert store.close_count == closes_before_call + 1


def test_query_knowledge_graph_closes_the_connection_even_when_the_graph_is_empty(demo_uri, monkeypatch):
    store = _FakeNeo4jStore(node_count=0, labels=[], rel_types=[])
    _configure_fake_neo4j(monkeypatch, store)
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    tool = next(t for t in registry.agent_tools() if t.name == "query_knowledge_graph")
    closes_before_call = store.close_count
    tool.invoke({"cypher": "MATCH (n) RETURN n LIMIT 1"})
    assert store.close_count == closes_before_call + 1


# ── Hybrid knowledge-graph search (Phase 2.3) ────────────────────


def test_merge_search_hits_combines_scores_for_a_term_matched_by_both_legs():
    from polanyi.kernel.capabilities import merge_search_hits

    vector_hits = [{"term": "Counterparty", "score": 0.9}]
    fulltext_hits = [{"term": "Counterparty", "score": 0.4}]
    merged = merge_search_hits(vector_hits, fulltext_hits, top_k=5)
    assert merged == [{"term": "Counterparty", "vector_score": 0.9, "fulltext_score": 0.4, "combined_score": 1.3}]


def test_merge_search_hits_never_fabricates_a_term_absent_from_both_legs():
    from polanyi.kernel.capabilities import merge_search_hits

    merged = merge_search_hits([{"term": "A", "score": 0.5}], [{"term": "B", "score": 0.5}], top_k=5)
    terms = {m["term"] for m in merged}
    assert terms == {"A", "B"}


def test_merge_search_hits_gives_a_fulltext_only_term_zero_vector_score_not_a_fabricated_one():
    from polanyi.kernel.capabilities import merge_search_hits

    merged = merge_search_hits([], [{"term": "Trade", "score": 0.6}], top_k=5)
    assert merged == [{"term": "Trade", "vector_score": 0.0, "fulltext_score": 0.6, "combined_score": 0.6}]


def test_merge_search_hits_respects_top_k_and_ranks_by_combined_score_descending():
    from polanyi.kernel.capabilities import merge_search_hits

    vector_hits = [{"term": "Low", "score": 0.1}, {"term": "High", "score": 0.9}]
    merged = merge_search_hits(vector_hits, [], top_k=1)
    assert merged == [{"term": "High", "vector_score": 0.9, "fulltext_score": 0.0, "combined_score": 0.9}]


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


def test_search_knowledge_graph_tool_registered_when_neo4j_configured(demo_uri, monkeypatch):
    _configure_fake_neo4j(monkeypatch, _FakeNeo4jStore(node_count=1, labels=[], rel_types=[]))
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    names = {t.name for t in registry.agent_tools()}
    assert "search_knowledge_graph" in names


def test_search_knowledge_graph_runs_fulltext_only_without_a_configured_embedding_provider(demo_uri, monkeypatch):
    import polanyi.execution.knowledge_graph as kg_module
    import polanyi.semantic.embeddings as embeddings_module

    monkeypatch.setenv("NEO4J_URI", "neo4j://fake:7687")
    monkeypatch.setattr(embeddings_module, "resolve_embedding_provider", lambda: None)
    fake_store = _FakeHybridStore(fulltext_hits=[{"term": "Counterparty", "score": 0.7}])
    monkeypatch.setattr(kg_module, "Neo4jGraphStore", lambda **kwargs: fake_store)

    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    tool = next(t for t in registry.agent_tools() if t.name == "search_knowledge_graph")
    result = tool.invoke({"query": "counterparty"})

    assert fake_store.last_query_vector is None  # never fabricated a vector with no provider
    assert "Counterparty" in result


def test_search_knowledge_graph_embeds_the_query_when_a_provider_is_configured(demo_uri, monkeypatch):
    import polanyi.execution.knowledge_graph as kg_module
    import polanyi.semantic.embeddings as embeddings_module

    class FakeProvider:
        def embed(self, texts):
            return [[0.1, 0.2, 0.3] for _ in texts]

    monkeypatch.setenv("NEO4J_URI", "neo4j://fake:7687")
    monkeypatch.setattr(embeddings_module, "resolve_embedding_provider", lambda: FakeProvider())
    fake_store = _FakeHybridStore(vector_hits=[{"term": "Trade", "score": 0.95}])
    monkeypatch.setattr(kg_module, "Neo4jGraphStore", lambda **kwargs: fake_store)

    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    tool = next(t for t in registry.agent_tools() if t.name == "search_knowledge_graph")
    result = tool.invoke({"query": "trade"})

    assert fake_store.last_query_vector == [0.1, 0.2, 0.3]
    assert "Trade" in result


def test_search_knowledge_graph_reports_honestly_when_nothing_matches(demo_uri, monkeypatch):
    import polanyi.execution.knowledge_graph as kg_module
    import polanyi.semantic.embeddings as embeddings_module

    monkeypatch.setenv("NEO4J_URI", "neo4j://fake:7687")
    monkeypatch.setattr(embeddings_module, "resolve_embedding_provider", lambda: None)
    fake_store = _FakeHybridStore()
    monkeypatch.setattr(kg_module, "Neo4jGraphStore", lambda **kwargs: fake_store)

    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    tool = next(t for t in registry.agent_tools() if t.name == "search_knowledge_graph")
    result = tool.invoke({"query": "nonexistent"})
    assert "no matching" in result.lower()


# ── Graph Data Science tools (Phase 3) ────────────────────────────


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


def _configure_fake_gds(monkeypatch, gds):
    import polanyi.execution.gds_tools as gds_module

    monkeypatch.setenv("NEO4J_URI", "neo4j://fake:7687")
    monkeypatch.setattr(gds_module, "gds_client_for_neo4j", lambda: gds)


def test_gds_tools_registered_when_plugin_is_available(demo_uri, monkeypatch):
    import polanyi.execution.knowledge_graph as kg_module

    monkeypatch.setattr(kg_module, "Neo4jGraphStore", lambda **kwargs: _FakeNeo4jStore(node_count=1, labels=[], rel_types=[]))
    _configure_fake_gds(monkeypatch, _FakeGds())
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    names = {t.name for t in registry.agent_tools()}
    assert {"graph_page_rank", "find_graph_communities", "find_similar_terms"} <= names


def test_gds_tools_omitted_when_graphdatascience_package_is_unavailable(demo_uri, monkeypatch):
    import polanyi.execution.knowledge_graph as kg_module

    monkeypatch.setattr(kg_module, "Neo4jGraphStore", lambda **kwargs: _FakeNeo4jStore(node_count=1, labels=[], rel_types=[]))
    _configure_fake_gds(monkeypatch, None)  # simulates graphdatascience not installed
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    names = {t.name for t in registry.agent_tools()}
    assert "graph_page_rank" not in names


def test_gds_tools_omitted_when_plugin_not_installed_server_side(demo_uri, monkeypatch):
    import polanyi.execution.knowledge_graph as kg_module

    monkeypatch.setattr(kg_module, "Neo4jGraphStore", lambda **kwargs: _FakeNeo4jStore(node_count=1, labels=[], rel_types=[]))

    class BrokenGds(_FakeGds):
        def version(self):
            raise RuntimeError("gds.version unknown procedure")

    _configure_fake_gds(monkeypatch, BrokenGds())
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    names = {t.name for t in registry.agent_tools()}
    assert "graph_page_rank" not in names


def test_graph_page_rank_tool_returns_real_ranked_results(demo_uri, monkeypatch):
    import polanyi.execution.knowledge_graph as kg_module

    monkeypatch.setattr(kg_module, "Neo4jGraphStore", lambda **kwargs: _FakeNeo4jStore(node_count=1, labels=[], rel_types=[]))
    gds = _FakeGds(page_rank_rows=[{"nodeId": 1, "score": 0.9}, {"nodeId": 2, "score": 0.2}])
    _configure_fake_gds(monkeypatch, gds)
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    tool = next(t for t in registry.agent_tools() if t.name == "graph_page_rank")
    result = tool.invoke({"top_n": 5})
    assert "node-1" in result
    assert gds.dropped_graphs == ["polanyi-pagerank"]  # projection cleaned up, not leaked


def test_find_similar_terms_tool_reports_honestly_when_no_embeddings_exist(demo_uri, monkeypatch):
    import polanyi.execution.knowledge_graph as kg_module

    monkeypatch.setattr(kg_module, "Neo4jGraphStore", lambda **kwargs: _FakeNeo4jStore(node_count=1, labels=[], rel_types=[]))
    gds = _FakeGds(embedded_count=0)
    _configure_fake_gds(monkeypatch, gds)
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    tool = next(t for t in registry.agent_tools() if t.name == "find_similar_terms")
    result = tool.invoke({"top_n": 5})
    assert "no term embeddings" in result.lower()


# ── GraphRAG (Phase 4) ─────────────────────────────────────────────


def test_graph_rag_query_tool_registered_when_neo4j_configured(demo_uri, monkeypatch):
    _configure_fake_neo4j(monkeypatch, _FakeNeo4jStore(node_count=1, labels=[], rel_types=[]))
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    names = {t.name for t in registry.agent_tools()}
    assert "graph_rag_query" in names


def test_graph_rag_query_tool_omitted_when_neo4j_unconfigured(demo_uri, monkeypatch):
    monkeypatch.delenv("NEO4J_URI", raising=False)
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    names = {t.name for t in registry.agent_tools()}
    assert "graph_rag_query" not in names


def test_graph_rag_query_tool_calls_through_to_the_real_pipeline_function(demo_uri, monkeypatch):
    import polanyi.execution.graphrag_pipeline as graphrag_module

    _configure_fake_neo4j(monkeypatch, _FakeNeo4jStore(node_count=1, labels=[], rel_types=[]))
    monkeypatch.setattr(graphrag_module, "graph_rag_query", lambda question: f"answered: {question}")
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    tool = next(t for t in registry.agent_tools() if t.name == "graph_rag_query")
    result = tool.invoke({"question": "What is a Counterparty?"})
    assert result == "answered: What is a Counterparty?"
