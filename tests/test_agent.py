import pytest

from graphos.agent import build_sql_tools
from graphos.demo import DEMO_BUSINESS_RULES, seed_demo_db
from graphos.generate import build_rule_contexts

RULES = build_rule_contexts(DEMO_BUSINESS_RULES)


@pytest.fixture()
def tools(tmp_path):
    db_path = tmp_path / "demo.db"
    seed_demo_db(str(db_path))
    return {t.name: t for t in build_sql_tools(f"sqlite:///{db_path}", RULES)}


def test_list_tables_tool_names_demo_tables(tools):
    out = tools["sql_db_list_tables"].invoke({})
    assert "trades" in out and "counterparties" in out


def test_schema_tool_returns_create_statements(tools):
    out = tools["sql_db_schema"].invoke({"table_names": "trades"})
    assert "CREATE TABLE" in out


def test_query_tool_executes_clean_sql(tools):
    out = tools["sql_db_query"].invoke({"query": "SELECT COUNT(*) FROM instruments"})
    assert "3" in out


def test_query_tool_blocks_rule_violating_sql_with_guidance(tools):
    sql = (
        "SELECT t.trade_id FROM trades t "
        "JOIN counterparties c ON t.counterparty_id = c.counterparty_id"
    )
    out = tools["sql_db_query"].invoke({"query": sql})
    assert "BLOCKED" in out
    assert "is_sanctioned" in out


def test_query_tool_blocks_dml(tools):
    out = tools["sql_db_query"].invoke({"query": "DELETE FROM trades"})
    assert "BLOCKED" in out
