"""Real KYC/portfolio demo dataset -- extracted from the real GLEIF/FIBO/
portfolio graph already materialized in Neo4j (never fabricated), not a
handwritten toy dataset like polanyi.demo's trades/counterparties schema.

extract_kyc_dataset takes a run_query callable (cypher, params) -> list[dict]
so these tests inject canned rows shaped exactly like the real Neo4j records
already inspected directly against the live graph, without needing a fake
driver/session protocol."""

import sqlite3

from polanyi.kyc_demo import (
    KYC_BUSINESS_RULES,
    extract_kyc_dataset,
    seed_kyc_demo_db,
)


def fake_run_query(responses):
    """responses: dict mapping a substring of the expected Cypher query to
    the canned rows it should return."""

    def run_query(cypher, params=None):
        for substring, rows in responses.items():
            if substring in cypher:
                return rows
        raise AssertionError(f"No canned response for query: {cypher}")

    return run_query


REAL_LEGAL_ENTITY_ROW = {
    "lei": "INE028A01039BOB00001",
    "legal_name": "Bank of Baroda",
    "jurisdiction": "IN",
    "sic_code": "SIC-6020",
    "sic_description": "State commercial banks-Federal Reserve members (state)",
    "fibo_class_label": "bank",
    "fibo_class_uri": "https://spec.edmcouncil.org/fibo/ontology/FBC/FunctionalEntities/FinancialServicesEntities/Bank",
}

REAL_UNRECONCILED_ENTITY_ROW = {
    "lei": "5493007S30BKLY2JMR58",
    "legal_name": "ICICI Bank Limited",
    "jurisdiction": "IN",
    "sic_code": None,
    "sic_description": None,
    "fibo_class_label": None,
    "fibo_class_uri": None,
}

REAL_PORTFOLIO_ROW = {
    "id": "port-global-fixed-income",
    "name": "Global Fixed Income Fund",
    "currency": "USD",
    "benchmark_index": "Bloomberg Global Aggregate",
    "total_market_value": 2.5e8,
}

REAL_SECURITY_ROW = {
    "id": "sec-ford-8pct-2028",
    "isin": "US345397AA00",
    "symbol": "F-8-2028",
    "name": "Ford Motor Credit 8.000% 2028",
    "instrument_type": "corporate bond",
    "asset_class": "bond",
    "rating": "BB+",
    "rating_agency": "S&P",
    "coupon_rate": 8.0,
    "yield_to_maturity": 8.45,
    "maturity_date": "2028-06-15",
    "currency": "USD",
    "face_value": 1000.0,
    "flagged_high_yield": True,
}

REAL_POSITION_ROW = {
    "id": "pos-gfi-ford",
    "portfolio_id": "port-global-fixed-income",
    "security_id": "sec-ford-8pct-2028",
    "shares": 5000,
    "market_value": 5250000.0,
    "currency": "USD",
    "as_of_date": "2026-06-21",
    "status": "open",
}

REAL_COMPLIANCE_FLAG_ROW = {
    "id": "flag-ford-hy",
    "security_id": "sec-ford-8pct-2028",
    "type": "HIGH_YIELD_HOLDING",
    "severity": "Medium",
    "status": "active",
    "reviewer": "Risk Committee",
    "raised_at": "2026-06-01",
    "description": "Ford Motor Credit 8% 2028 is rated BB+ (high-yield).",
}

REAL_POLICY_ROW = {
    "id": "policy-001",
    "name": "GraphOS Capital Investment Policy Statement v2.4",
    "version": "2.4",
    "effective_date": "2025-01-01",
    "last_review_date": "2026-01-15",
    "approved_by": "Risk Committee",
    "investment_grade_min_rating": "BBB-",
    "high_yield_min_rating": "BB-",
    "high_yield_max_allocation": 0.1,
    "high_yield_max_single_issuer": 0.03,
    "high_yield_note": "Bonds rated CCC or below are prohibited.",
}

REAL_POLICY_PORTFOLIO_ROW = {"policy_id": "policy-001", "portfolio_id": "port-global-fixed-income"}


def full_responses(**overrides):
    # Keys are distinguishing substrings unique to one query each -- e.g. the
    # positions query itself contains "(s:Security)", so a bare "Security)"
    # key would wrongly shadow the securities query. HAS_POSITION/IN_SECURITY
    # only ever appear together in the positions query.
    responses = {
        "GleifEntity": [REAL_LEGAL_ENTITY_ROW, REAL_UNRECONCILED_ENTITY_ROW],
        "HAS_POSITION": [REAL_POSITION_ROW],
        "MATCH (n:Portfolio)": [REAL_PORTFOLIO_ROW],
        "MATCH (n:Security)": [REAL_SECURITY_ROW],
        "ComplianceFlag)-[:FLAGS]": [REAL_COMPLIANCE_FLAG_ROW],
        "MATCH (n:InvestmentPolicy)": [REAL_POLICY_ROW],
        "GOVERNS": [REAL_POLICY_PORTFOLIO_ROW],
    }
    responses.update(overrides)
    return responses


# ── extract_kyc_dataset (pure, given an injected run_query) ─────────


def test_extract_kyc_dataset_maps_legal_entities_including_unreconciled_ones():
    dataset = extract_kyc_dataset(fake_run_query(full_responses()))
    assert dataset["legal_entities"] == [REAL_LEGAL_ENTITY_ROW, REAL_UNRECONCILED_ENTITY_ROW]


def test_extract_kyc_dataset_maps_portfolios_securities_positions():
    dataset = extract_kyc_dataset(fake_run_query(full_responses()))
    assert dataset["portfolios"] == [REAL_PORTFOLIO_ROW]
    assert dataset["securities"] == [REAL_SECURITY_ROW]
    assert dataset["positions"] == [REAL_POSITION_ROW]


def test_extract_kyc_dataset_maps_compliance_flags_and_policy():
    dataset = extract_kyc_dataset(fake_run_query(full_responses()))
    assert dataset["compliance_flags"] == [REAL_COMPLIANCE_FLAG_ROW]
    assert dataset["investment_policies"] == [REAL_POLICY_ROW]
    assert dataset["investment_policy_portfolios"] == [REAL_POLICY_PORTFOLIO_ROW]


# ── seed_kyc_demo_db (the only I/O) ──────────────────────────────────


def test_seed_kyc_demo_db_creates_the_real_relational_schema(tmp_path):
    db_path = tmp_path / "kyc.db"
    seed_kyc_demo_db(str(db_path), fake_run_query(full_responses()))

    con = sqlite3.connect(db_path)
    tables = {row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {
        "legal_entities",
        "portfolios",
        "securities",
        "positions",
        "compliance_flags",
        "investment_policies",
        "investment_policy_portfolios",
    } <= tables


def test_seed_kyc_demo_db_inserts_real_rows_with_correct_values(tmp_path):
    db_path = tmp_path / "kyc.db"
    seed_kyc_demo_db(str(db_path), fake_run_query(full_responses()))

    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    entity = con.execute(
        "SELECT * FROM legal_entities WHERE lei = ?", (REAL_LEGAL_ENTITY_ROW["lei"],)
    ).fetchone()
    assert entity["legal_name"] == "Bank of Baroda"
    assert entity["fibo_class_label"] == "bank"

    unreconciled = con.execute(
        "SELECT * FROM legal_entities WHERE lei = ?", (REAL_UNRECONCILED_ENTITY_ROW["lei"],)
    ).fetchone()
    assert unreconciled["fibo_class_label"] is None

    security = con.execute("SELECT * FROM securities WHERE id = ?", (REAL_SECURITY_ROW["id"],)).fetchone()
    assert security["rating"] == "BB+"
    assert security["isin"] == "US345397AA00"

    position = con.execute("SELECT * FROM positions WHERE id = ?", (REAL_POSITION_ROW["id"],)).fetchone()
    assert position["portfolio_id"] == "port-global-fixed-income"
    assert position["security_id"] == "sec-ford-8pct-2028"


def test_seed_kyc_demo_db_join_across_portfolio_position_security_works(tmp_path):
    """The whole point of extracting real, connected graph data -- prove the
    relational join actually reconstructs the same real traversal the graph
    now supports after the relationship repair."""
    db_path = tmp_path / "kyc.db"
    seed_kyc_demo_db(str(db_path), fake_run_query(full_responses()))

    con = sqlite3.connect(db_path)
    row = con.execute(
        "SELECT pf.name, s.name, s.rating FROM positions p "
        "JOIN portfolios pf ON p.portfolio_id = pf.id "
        "JOIN securities s ON p.security_id = s.id "
        "WHERE p.id = ?",
        (REAL_POSITION_ROW["id"],),
    ).fetchone()
    assert row == ("Global Fixed Income Fund", "Ford Motor Credit 8.000% 2028", "BB+")


def test_seed_kyc_demo_db_is_idempotent(tmp_path):
    db_path = tmp_path / "kyc.db"
    seed_kyc_demo_db(str(db_path), fake_run_query(full_responses()))
    first = sqlite3.connect(db_path).execute("SELECT COUNT(*) FROM securities").fetchone()[0]
    seed_kyc_demo_db(str(db_path), fake_run_query(full_responses()))
    second = sqlite3.connect(db_path).execute("SELECT COUNT(*) FROM securities").fetchone()[0]
    assert first == second == 1


def test_seed_kyc_demo_db_returns_real_counts_not_guessed(tmp_path):
    db_path = tmp_path / "kyc.db"
    counts = seed_kyc_demo_db(str(db_path), fake_run_query(full_responses()))
    assert counts["legal_entities"] == 2
    assert counts["portfolios"] == 1
    assert counts["securities"] == 1
    assert counts["positions"] == 1


# ── KYC_BUSINESS_RULES (derived from the real investment policy) ────


def test_kyc_business_rules_cover_the_real_policy_limits():
    rule_ids = {r.rule_id for r in KYC_BUSINESS_RULES}
    assert len(rule_ids) >= 3
    descriptions = " ".join(r.description for r in KYC_BUSINESS_RULES)
    assert "3%" in descriptions or "0.03" in descriptions
    assert "CCC" in descriptions
