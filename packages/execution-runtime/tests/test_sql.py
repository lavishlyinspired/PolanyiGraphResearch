import pytest

from polanyi.demo import DEMO_BUSINESS_RULES, seed_demo_db
from polanyi.semantic.generate import build_rule_contexts
from polanyi.execution.sql import execute_sql

RULES = build_rule_contexts(DEMO_BUSINESS_RULES)


@pytest.fixture()
def db_uri(tmp_path):
    path = tmp_path / "demo.db"
    seed_demo_db(str(path))
    return f"sqlite:///{path}"


def test_a_blocked_query_is_not_executed(db_uri):
    sql = """
    SELECT t.trade_id, c.legal_name
    FROM trades t JOIN counterparties c ON t.counterparty_id = c.counterparty_id
    """
    result = execute_sql(sql, RULES, db_uri)
    assert not result.validation.valid
    assert result.rows == []
    assert result.columns == []


def test_a_valid_query_runs_and_returns_structured_rows(db_uri):
    result = execute_sql("SELECT legal_name FROM counterparties LIMIT 3", RULES, db_uri)
    assert result.validation.valid
    assert result.columns == ["legal_name"]
    assert len(result.rows) == 3
    assert all(set(row.keys()) == {"legal_name"} for row in result.rows)


def test_a_valid_query_with_zero_matching_rows_returns_empty_rows_not_an_error(db_uri):
    result = execute_sql(
        "SELECT legal_name FROM counterparties WHERE legal_name = 'no-such-firm'",
        RULES,
        db_uri,
    )
    assert result.validation.valid
    assert result.rows == []
    assert result.columns == ["legal_name"]
