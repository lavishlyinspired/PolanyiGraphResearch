import pytest

from graphos.kernel.capabilities import (
    CapabilityNotFound,
    CapabilityProvider,
    CapabilityRegistry,
    default_registry,
)
from graphos.demo import DEMO_BUSINESS_RULES, seed_demo_db
from graphos.semantic.generate import build_rule_contexts


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
