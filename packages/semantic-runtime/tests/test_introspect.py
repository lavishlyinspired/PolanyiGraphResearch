import pytest

from polanyi.demo import seed_demo_db
from polanyi.semantic.introspect import introspect


@pytest.fixture()
def demo_uri(tmp_path):
    db_path = tmp_path / "demo.db"
    seed_demo_db(str(db_path))
    return f"sqlite:///{db_path}"


def test_introspect_lists_all_tables(demo_uri):
    snapshot = introspect(demo_uri)
    names = {t.name for t in snapshot.tables}
    assert {"trades", "counterparties", "instruments"} <= names
    assert snapshot.dialect == "sqlite"


def test_introspect_captures_columns_and_primary_keys(demo_uri):
    snapshot = introspect(demo_uri)
    trades = next(t for t in snapshot.tables if t.name == "trades")
    col_names = {c.name for c in trades.columns}
    assert {"trade_id", "notional_amount", "counterparty_id"} <= col_names
    pk = [c for c in trades.columns if c.primary_key]
    assert pk and pk[0].name == "trade_id"


def test_introspect_captures_foreign_keys(demo_uri):
    snapshot = introspect(demo_uri)
    trades = next(t for t in snapshot.tables if t.name == "trades")
    fk_targets = {fk.references_table for fk in trades.foreign_keys}
    assert {"counterparties", "instruments"} <= fk_targets


def test_introspect_does_not_eagerly_generate_llm_table_info(demo_uri):
    """table_info_text is LLM-only fuel — computed lazily by table_info_text_for(),
    not as part of every introspect() call (introspect() is on the hot path for
    every schema browse; the LLM path is opt-in and comparatively rare)."""
    snapshot = introspect(demo_uri)
    assert not hasattr(snapshot, "table_info_text")


def test_table_info_text_for_produces_create_table_ddl_for_llm(demo_uri):
    from polanyi.semantic.introspect import table_info_text_for

    text = table_info_text_for(demo_uri)
    assert "CREATE TABLE" in text
    assert "trades" in text


def test_databricks_uris_are_normalized_for_sqlalchemy():
    from polanyi.semantic.introspect import _normalize_databricks_uri

    friendly = (
        "databricks://token:PASS@host.cloud.databricks.com"
        "/sql/1.0/warehouses/abc123?catalog=workspace&schema=polanyi_demo"
    )
    normalized = _normalize_databricks_uri(friendly)
    assert normalized.startswith("databricks://token:PASS@host.cloud.databricks.com?")
    assert "http_path=%2Fsql%2F1.0%2Fwarehouses%2Fabc123" in normalized
    assert "catalog=workspace" in normalized
    assert "schema=polanyi_demo" in normalized


def test_non_databricks_uris_pass_through_unchanged():
    from polanyi.semantic.introspect import _normalize_databricks_uri

    assert _normalize_databricks_uri("sqlite:///x.db") == "sqlite:///x.db"
