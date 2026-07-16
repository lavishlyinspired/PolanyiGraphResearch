import sqlite3

from graphos.demo import DEMO_BUSINESS_RULES, seed_demo_db


def test_seed_demo_db_creates_financial_tables(tmp_path):
    db_path = tmp_path / "demo.db"
    seed_demo_db(str(db_path))

    con = sqlite3.connect(db_path)
    tables = {
        row[0]
        for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    assert {
        "trades",
        "counterparties",
        "instruments",
        "positions",
        "accounts",
        "risk_metrics",
        "daily_pnl",
    } <= tables


def test_seed_demo_db_populates_sample_rows(tmp_path):
    db_path = tmp_path / "demo.db"
    seed_demo_db(str(db_path))

    con = sqlite3.connect(db_path)
    assert con.execute("SELECT COUNT(*) FROM trades").fetchone()[0] > 0
    assert con.execute("SELECT COUNT(*) FROM counterparties").fetchone()[0] > 0
    sanctioned = con.execute(
        "SELECT COUNT(*) FROM counterparties WHERE is_sanctioned = 1"
    ).fetchone()[0]
    assert sanctioned >= 1, "demo needs a sanctioned counterparty for the rules demo"


def test_seed_demo_db_is_idempotent(tmp_path):
    db_path = tmp_path / "demo.db"
    seed_demo_db(str(db_path))
    first = sqlite3.connect(db_path).execute("SELECT COUNT(*) FROM trades").fetchone()[0]
    seed_demo_db(str(db_path))
    second = sqlite3.connect(db_path).execute("SELECT COUNT(*) FROM trades").fetchone()[0]
    assert first == second


def test_demo_business_rules_cover_critical_compliance():
    rule_ids = {r.rule_id for r in DEMO_BUSINESS_RULES}
    assert "BR-001" in rule_ids
    severities = {r.severity for r in DEMO_BUSINESS_RULES}
    assert "CRITICAL" in severities
