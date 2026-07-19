"""Real KYC/portfolio demo dataset: extracted from real reference data
already materialized in Neo4j (real GLEIF legal entities, real corporate/
government bond ISINs, a real FIBO ontology import via n10s, real SIC
codes, a real investment policy with concrete concentration limits) into a
proper relational SQLite schema Polanyi's own pipeline can run against --
the same role polanyi.demo's trades/counterparties schema plays, but
grounded in real data rather than a handwritten toy dataset.

extract_kyc_dataset takes a run_query callable (cypher, params) -> list[dict]
rather than a raw driver, so the extraction logic is testable without
faking the driver/session protocol."""

from __future__ import annotations

import sqlite3
from typing import Any, Callable, Optional

from polanyi.models import BusinessRule

RunQuery = Callable[[str, Optional[dict]], list[dict]]

DDL = """
CREATE TABLE IF NOT EXISTS legal_entities (
    lei              VARCHAR(20) PRIMARY KEY,
    legal_name       VARCHAR(200) NOT NULL,
    jurisdiction     VARCHAR(4),
    sic_code         VARCHAR(20),
    sic_description  VARCHAR(200),
    fibo_class_label VARCHAR(100),
    fibo_class_uri   VARCHAR(300)
);

CREATE TABLE IF NOT EXISTS portfolios (
    id                  VARCHAR(50) PRIMARY KEY,
    name                VARCHAR(200) NOT NULL,
    currency            VARCHAR(3),
    benchmark_index     VARCHAR(200),
    total_market_value  DECIMAL(18,2)
);

CREATE TABLE IF NOT EXISTS securities (
    id                  VARCHAR(50) PRIMARY KEY,
    isin                VARCHAR(12),
    symbol              VARCHAR(20),
    name                VARCHAR(200) NOT NULL,
    instrument_type     VARCHAR(50),
    asset_class         VARCHAR(50),
    rating              VARCHAR(10),
    rating_agency       VARCHAR(20),
    coupon_rate         DECIMAL(8,4),
    yield_to_maturity   DECIMAL(8,4),
    maturity_date       DATE,
    currency            VARCHAR(3),
    face_value          DECIMAL(18,2),
    flagged_high_yield  BOOLEAN DEFAULT 0
);

CREATE TABLE IF NOT EXISTS positions (
    id            VARCHAR(50) PRIMARY KEY,
    portfolio_id  VARCHAR(50) REFERENCES portfolios(id),
    security_id   VARCHAR(50) REFERENCES securities(id),
    shares        DECIMAL(18,4),
    market_value  DECIMAL(18,2),
    currency      VARCHAR(3),
    as_of_date    DATE,
    status        VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS compliance_flags (
    id           VARCHAR(50) PRIMARY KEY,
    security_id  VARCHAR(50) REFERENCES securities(id),
    type         VARCHAR(50),
    severity     VARCHAR(20),
    status       VARCHAR(20),
    reviewer     VARCHAR(100),
    raised_at    DATE,
    description  VARCHAR(500)
);

CREATE TABLE IF NOT EXISTS investment_policies (
    id                            VARCHAR(50) PRIMARY KEY,
    name                          VARCHAR(200) NOT NULL,
    version                       VARCHAR(10),
    effective_date                DATE,
    last_review_date              DATE,
    approved_by                   VARCHAR(100),
    investment_grade_min_rating   VARCHAR(10),
    high_yield_min_rating         VARCHAR(10),
    high_yield_max_allocation     DECIMAL(6,4),
    high_yield_max_single_issuer  DECIMAL(6,4),
    high_yield_note               TEXT
);

CREATE TABLE IF NOT EXISTS investment_policy_portfolios (
    policy_id     VARCHAR(50) REFERENCES investment_policies(id),
    portfolio_id  VARCHAR(50) REFERENCES portfolios(id),
    PRIMARY KEY (policy_id, portfolio_id)
);
"""

_QUERIES: dict[str, str] = {
    "legal_entities": (
        "MATCH (n:GleifEntity) "
        "OPTIONAL MATCH (n)-[:RECONCILED_TO_SIC]->(sic:SicCode) "
        "OPTIONAL MATCH (n)-[:RECONCILED_TO_FIBO_CLASS]->(fibo) "
        "RETURN n.lei AS lei, n.legalName AS legal_name, n.jurisdiction AS jurisdiction, "
        "sic.code AS sic_code, sic.description AS sic_description, "
        "fibo.rdfs__label AS fibo_class_label, fibo.uri AS fibo_class_uri"
    ),
    "portfolios": (
        "MATCH (n:Portfolio) RETURN n.id AS id, n.name AS name, n.currency AS currency, "
        "n.benchmarkIndex AS benchmark_index, n.totalMarketValue AS total_market_value"
    ),
    "securities": (
        "MATCH (n:Security) RETURN n.id AS id, n.isin AS isin, n.symbol AS symbol, "
        "n.name AS name, n.instrumentType AS instrument_type, n.assetClass AS asset_class, "
        "n.rating AS rating, n.ratingAgency AS rating_agency, n.couponRate AS coupon_rate, "
        "n.yieldToMaturity AS yield_to_maturity, n.maturityDate AS maturity_date, "
        "n.currency AS currency, n.faceValue AS face_value, "
        "n.flaggedHighYield AS flagged_high_yield"
    ),
    "positions": (
        "MATCH (pf:Portfolio)-[:HAS_POSITION]->(p:Position)-[:IN_SECURITY]->(s:Security) "
        "RETURN p.id AS id, pf.id AS portfolio_id, s.id AS security_id, "
        "p.shares AS shares, p.marketValue AS market_value, p.currency AS currency, "
        "p.asOfDate AS as_of_date, p.status AS status"
    ),
    "compliance_flags": (
        "MATCH (f:ComplianceFlag)-[:FLAGS]->(s:Security) "
        "RETURN f.id AS id, s.id AS security_id, f.type AS type, f.severity AS severity, "
        "f.status AS status, f.reviewer AS reviewer, f.raisedAt AS raised_at, "
        "f.description AS description"
    ),
    "investment_policies": (
        "MATCH (n:InvestmentPolicy) RETURN n.id AS id, n.name AS name, n.version AS version, "
        "n.effectiveDate AS effective_date, n.lastReviewDate AS last_review_date, "
        "n.approvedBy AS approved_by, "
        "n.investmentGradeMinRating AS investment_grade_min_rating, "
        "n.highYieldMinRating AS high_yield_min_rating, "
        "n.highYieldMaxAllocation AS high_yield_max_allocation, "
        "n.highYieldMaxSingleIssuer AS high_yield_max_single_issuer, "
        "n.highYieldNote AS high_yield_note"
    ),
    "investment_policy_portfolios": (
        "MATCH (policy:InvestmentPolicy)-[:GOVERNS]->(pf:Portfolio) "
        "RETURN policy.id AS policy_id, pf.id AS portfolio_id"
    ),
}

_COLUMNS: dict[str, list[str]] = {
    "legal_entities": [
        "lei", "legal_name", "jurisdiction", "sic_code", "sic_description",
        "fibo_class_label", "fibo_class_uri",
    ],
    "portfolios": ["id", "name", "currency", "benchmark_index", "total_market_value"],
    "securities": [
        "id", "isin", "symbol", "name", "instrument_type", "asset_class", "rating",
        "rating_agency", "coupon_rate", "yield_to_maturity", "maturity_date", "currency",
        "face_value", "flagged_high_yield",
    ],
    "positions": [
        "id", "portfolio_id", "security_id", "shares", "market_value", "currency",
        "as_of_date", "status",
    ],
    "compliance_flags": [
        "id", "security_id", "type", "severity", "status", "reviewer", "raised_at",
        "description",
    ],
    "investment_policies": [
        "id", "name", "version", "effective_date", "last_review_date", "approved_by",
        "investment_grade_min_rating", "high_yield_min_rating", "high_yield_max_allocation",
        "high_yield_max_single_issuer", "high_yield_note",
    ],
    "investment_policy_portfolios": ["policy_id", "portfolio_id"],
}


def extract_kyc_dataset(run_query: RunQuery) -> dict[str, list[dict[str, Any]]]:
    """Every table's real rows, straight from the (now properly connected)
    Neo4j graph -- no fabricated or hand-typed values."""
    return {table: run_query(query, {}) for table, query in _QUERIES.items()}


def seed_kyc_demo_db(sqlite_path: str, run_query: RunQuery) -> dict[str, int]:
    """Create (or refresh) the real KYC/portfolio database at `sqlite_path`.
    Idempotent -- INSERT OR REPLACE keyed on each table's real id."""
    dataset = extract_kyc_dataset(run_query)
    con = sqlite3.connect(sqlite_path)
    try:
        con.executescript(DDL)
        counts = {}
        for table, rows in dataset.items():
            columns = _COLUMNS[table]
            placeholders = ", ".join(f":{c}" for c in columns)
            con.executemany(
                f"INSERT OR REPLACE INTO {table} ({', '.join(columns)}) VALUES ({placeholders})",
                rows,
            )
            counts[table] = len(rows)
        con.commit()
        return counts
    finally:
        con.close()


KYC_BUSINESS_RULES: list[BusinessRule] = [
    BusinessRule(
        rule_id="KYC-001",
        name="Single High-Yield Issuer Concentration Cap",
        description=(
            "No single high-yield issuer's combined market value across all "
            "portfolios may exceed 3% (0.03) of total portfolio value "
            "(investment_policies.high_yield_max_single_issuer)."
        ),
        tables=["positions", "securities", "investment_policies"],
        severity="CRITICAL",
    ),
    BusinessRule(
        rule_id="KYC-002",
        name="Total High-Yield Allocation Cap",
        description=(
            "High-yield bonds (rated below investment grade) are permitted "
            "up to 10% (0.10) of total portfolio market value "
            "(investment_policies.high_yield_max_allocation)."
        ),
        tables=["positions", "securities", "investment_policies"],
        severity="HIGH",
    ),
    BusinessRule(
        rule_id="KYC-003",
        name="CCC-Rated Bonds Prohibited",
        description="Bonds rated CCC or below are prohibited (investment_policies.high_yield_note).",
        tables=["securities", "investment_policies"],
        severity="CRITICAL",
    ),
    BusinessRule(
        rule_id="KYC-004",
        name="Quarterly Risk Committee Review",
        description="All high-yield holdings must be reviewed by the Risk Committee quarterly.",
        tables=["compliance_flags"],
        severity="MEDIUM",
    ),
]
