import pytest

from graphos.demo import seed_demo_db
from graphos.introspect import introspect


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


def test_introspect_produces_table_info_text_for_llm(demo_uri):
    snapshot = introspect(demo_uri)
    assert "CREATE TABLE" in snapshot.table_info_text
    assert "trades" in snapshot.table_info_text
