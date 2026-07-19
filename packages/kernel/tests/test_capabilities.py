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


def test_default_registry_registers_the_ontology_specialist_when_graphdb_configured(demo_uri, monkeypatch):
    """search_ontology/expand_ontology/query_ontology are no longer exposed
    directly on the supervisor's tool list -- they're internal to the
    ontology specialist's own platform/specialists/ontology/tools.py now
    (see packages/kernel/tests/test_ontology_specialist_tools.py for their
    behavior coverage). The supervisor only sees ask_ontology_specialist."""
    _configure_fake_graphdb(monkeypatch)
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    names = {t.name for t in registry.agent_tools()}
    assert "ask_ontology_specialist" in names
    assert not {"search_ontology", "expand_ontology", "query_ontology"} & names


def test_default_registry_omits_the_ontology_specialist_when_graphdb_unconfigured(demo_uri, monkeypatch):
    import polanyi.semantic.ontology as ontology_module

    monkeypatch.setattr(ontology_module, "graphdb_configured", lambda: False)
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    names = {t.name for t in registry.agent_tools()}
    assert "ask_ontology_specialist" not in names


def test_default_registry_registers_the_graph_specialist_when_neo4j_configured(demo_uri, monkeypatch):
    """query_knowledge_graph/search_knowledge_graph/graph_page_rank/
    find_graph_communities/find_similar_terms/graph_rag_query are no longer
    exposed directly on the supervisor's tool list -- they're internal to
    the graph specialist's own platform/specialists/graph/tools.py now
    (see packages/kernel/tests/test_graph_specialist_tools.py for their
    behavior coverage, relocated from this file in S22). The supervisor
    only sees ask_graph_specialist."""
    import polanyi.execution.knowledge_graph as kg_module
    import polanyi.execution.gds_tools as gds_module

    class FakeStore:
        def run_cypher(self, query):
            if "count(n)" in query:
                return [{"c": 1}]
            if "db.labels" in query:
                return [{"label": "Entity"}]
            if "db.relationshipTypes" in query:
                return [{"relationshipType": "DESCRIBES"}]
            return []

        def close(self):
            pass

    monkeypatch.setattr(kg_module, "neo4j_configured", lambda: True)
    monkeypatch.setattr(kg_module, "Neo4jGraphStore", lambda **kwargs: FakeStore())
    monkeypatch.setattr(gds_module, "gds_client_for_neo4j", lambda: None)

    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    names = {t.name for t in registry.agent_tools()}
    assert "ask_graph_specialist" in names
    assert not {
        "query_knowledge_graph",
        "search_knowledge_graph",
        "graph_page_rank",
        "find_graph_communities",
        "find_similar_terms",
        "graph_rag_query",
    } & names


def test_default_registry_omits_the_graph_specialist_when_neo4j_unconfigured(demo_uri, monkeypatch):
    import polanyi.execution.knowledge_graph as kg_module

    monkeypatch.setattr(kg_module, "neo4j_configured", lambda: False)
    registry = default_registry(demo_uri, build_rule_contexts(DEMO_BUSINESS_RULES))
    names = {t.name for t in registry.agent_tools()}
    assert "ask_graph_specialist" not in names
