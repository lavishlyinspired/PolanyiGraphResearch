"""Demo dataset: a small financial trading & risk database.

This is the reference domain used across GraphOS docs, tests, and the UI —
originally prototyped in notebooks/schema_to_semantic_context.ipynb.
"""

from __future__ import annotations

import sqlite3

from graphos.models import BusinessRule

DDL = """
CREATE TABLE IF NOT EXISTS trades (
    trade_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_date      TIMESTAMP NOT NULL,
    settlement_date TIMESTAMP NOT NULL,
    counterparty_id INTEGER REFERENCES counterparties(counterparty_id),
    instrument_id   INTEGER REFERENCES instruments(instrument_id),
    trade_type      VARCHAR(20) NOT NULL,
    quantity        DECIMAL(18,4) NOT NULL,
    price           DECIMAL(18,6) NOT NULL,
    notional_amount DECIMAL(18,2) NOT NULL,
    currency        VARCHAR(3) DEFAULT 'USD',
    status          VARCHAR(20) DEFAULT 'EXECUTED'
);

CREATE TABLE IF NOT EXISTS counterparties (
    counterparty_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    legal_name        VARCHAR(200) NOT NULL,
    short_name        VARCHAR(50),
    country           VARCHAR(3),
    risk_rating       VARCHAR(10),
    is_sanctioned     BOOLEAN DEFAULT 0,
    sector            VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS instruments (
    instrument_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    isin              VARCHAR(12),
    cusip             VARCHAR(9),
    symbol            VARCHAR(10) NOT NULL,
    name              VARCHAR(200) NOT NULL,
    asset_class       VARCHAR(50) NOT NULL,
    issuer            VARCHAR(200),
    maturity_date     DATE,
    coupon_rate       DECIMAL(8,4),
    currency          VARCHAR(3),
    exchange          VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS positions (
    position_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id        INTEGER REFERENCES accounts(account_id),
    instrument_id     INTEGER REFERENCES instruments(instrument_id),
    quantity          DECIMAL(18,4) NOT NULL,
    avg_cost          DECIMAL(18,6) NOT NULL,
    market_value      DECIMAL(18,2),
    unrealized_pnl    DECIMAL(18,2),
    as_of_date        DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
    account_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    account_name      VARCHAR(100) NOT NULL,
    account_type      VARCHAR(30),
    base_currency     VARCHAR(3) DEFAULT 'USD',
    inception_date    DATE,
    status            VARCHAR(20) DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS risk_metrics (
    metric_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    position_id       INTEGER REFERENCES positions(position_id),
    metric_date       DATE NOT NULL,
    var_95            DECIMAL(18,2),
    var_99            DECIMAL(18,2),
    cvar              DECIMAL(18,2),
    sharpe_ratio      DECIMAL(8,4),
    max_drawdown      DECIMAL(8,4),
    volatility        DECIMAL(8,4)
);

CREATE TABLE IF NOT EXISTS daily_pnl (
    trade_date        DATE NOT NULL,
    desk              VARCHAR(50),
    strategy          VARCHAR(100),
    realized_pnl      DECIMAL(18,2),
    unrealized_pnl    DECIMAL(18,2),
    total_pnl         DECIMAL(18,2),
    trade_count       INTEGER,
    notional_traded   DECIMAL(18,2)
);
"""

SEED = """
INSERT INTO counterparties (legal_name, short_name, country, risk_rating, is_sanctioned, sector)
VALUES
  ('Goldman Sachs Group Inc', 'GS', 'US', 'AA', 0, 'Financial Services'),
  ('Morgan Stanley', 'MS', 'US', 'AA', 0, 'Financial Services'),
  ('Deutsche Bank AG', 'DB', 'DE', 'BBB', 0, 'Banking'),
  ('Bank of China', 'BOC', 'CN', 'A', 0, 'Banking'),
  ('National Bank of Iran', 'NBI', 'IR', 'CCC', 1, 'Banking');

INSERT INTO instruments (isin, cusip, symbol, name, asset_class, issuer, currency, exchange)
VALUES
  ('US0378331005', '037833100', 'AAPL', 'Apple Inc.', 'EQUITY', 'Apple Inc.', 'USD', 'NASDAQ'),
  ('US5949181045', '594918104', 'MSFT', 'Microsoft Corp', 'EQUITY', 'Microsoft Corp', 'USD', 'NASDAQ'),
  ('US9128285Y80', '9128285Y8', 'UST_10Y', 'US Treasury 10Y', 'FIXED_INCOME', 'US Treasury', 'USD', 'OTC');

INSERT INTO accounts (account_name, account_type, base_currency, status)
VALUES
  ('Prop Trading Fund A', 'TRADING', 'USD', 'ACTIVE'),
  ('Client Fund B', 'TRADING', 'USD', 'ACTIVE');

INSERT INTO trades (trade_date, settlement_date, counterparty_id, instrument_id, trade_type, quantity, price, notional_amount, currency, status)
VALUES
  ('2026-01-15', '2026-01-17', 1, 1, 'BUY', 1000, 185.50, 185500.00, 'USD', 'EXECUTED'),
  ('2026-01-16', '2026-01-18', 2, 2, 'BUY', 500, 420.00, 210000.00, 'USD', 'EXECUTED'),
  ('2026-01-17', '2026-01-19', 1, 3, 'BUY', 1000000, 98.50, 98500000.00, 'USD', 'EXECUTED'),
  ('2026-01-20', '2026-01-22', 5, 1, 'SELL', 200, 190.00, 38000.00, 'USD', 'EXECUTED'),
  ('2026-02-03', '2026-02-05', 3, 2, 'BUY', 800, 415.25, 332200.00, 'USD', 'EXECUTED'),
  ('2026-02-10', '2026-02-12', 4, 3, 'SELL', 500000, 98.75, 49375000.00, 'USD', 'SETTLED');

INSERT INTO positions (account_id, instrument_id, quantity, avg_cost, market_value, unrealized_pnl, as_of_date)
VALUES
  (1, 1, 1000, 185.50, 192000.00, 6500.00, '2026-02-28'),
  (1, 3, 1000000, 98.50, 99100000.00, 600000.00, '2026-02-28'),
  (2, 2, 1300, 417.18, 549900.00, 7566.00, '2026-02-28');

INSERT INTO risk_metrics (position_id, metric_date, var_95, var_99, cvar, sharpe_ratio, max_drawdown, volatility)
VALUES
  (1, '2026-02-28', 12500.00, 18400.00, 21000.00, 1.42, 0.08, 0.22),
  (2, '2026-02-28', 1450000.00, 2100000.00, 2400000.00, 0.95, 0.04, 0.06),
  (3, '2026-02-28', 8900.00, 13100.00, 15000.00, 1.10, 0.11, 0.19);

INSERT INTO daily_pnl (trade_date, desk, strategy, realized_pnl, unrealized_pnl, total_pnl, trade_count, notional_traded)
VALUES
  ('2026-02-27', 'Equities', 'Long/Short', 42000.00, 12000.00, 54000.00, 18, 4200000.00),
  ('2026-02-28', 'Rates', 'Curve', -15000.00, 610000.00, 595000.00, 6, 99000000.00);
"""

DEMO_BUSINESS_RULES: list[BusinessRule] = [
    BusinessRule(
        rule_id="BR-001",
        name="Sanctioned Counterparty Check",
        description="No trade may be executed with a counterparty where is_sanctioned = TRUE",
        tables=["counterparties", "trades"],
        severity="CRITICAL",
    ),
    BusinessRule(
        rule_id="BR-002",
        name="Settlement Date Validation",
        description="Settlement date must be >= trade_date (T+1 or later)",
        tables=["trades"],
        severity="HIGH",
    ),
    BusinessRule(
        rule_id="BR-003",
        name="VaR Threshold Alert",
        description="If var_95 > 1000000, flag position for review",
        tables=["risk_metrics"],
        severity="MEDIUM",
    ),
    BusinessRule(
        rule_id="BR-004",
        name="Revenue Definition",
        description=(
            "Revenue = SUM(total_pnl) where status = 'EXECUTED' "
            "and trade_date >= fiscal_year_start"
        ),
        tables=["trades"],
        severity="INFO",
    ),
    BusinessRule(
        rule_id="BR-005",
        name="High-Risk Country Exposure",
        description=(
            "If counterparty.country IN ('IR','KP','SY','CU') "
            "and notional_amount > 500000, require EDD"
        ),
        tables=["counterparties", "trades"],
        severity="CRITICAL",
    ),
]


def seed_demo_db(path: str) -> None:
    """Create (or refresh) the demo financial database at `path`. Idempotent."""
    con = sqlite3.connect(path)
    try:
        con.executescript(DDL)
        has_rows = con.execute("SELECT COUNT(*) FROM counterparties").fetchone()[0] > 0
        if not has_rows:
            con.executescript(SEED)
            con.commit()
    finally:
        con.close()
