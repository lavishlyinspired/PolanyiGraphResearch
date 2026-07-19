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


def _configure_fake_graphdb(monkeypatch, search_result=None, expand_result=None):
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
    assert "fibo:MunicipalBond" in result


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
