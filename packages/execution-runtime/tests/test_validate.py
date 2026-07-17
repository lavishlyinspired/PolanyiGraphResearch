from polanyi.demo import DEMO_BUSINESS_RULES
from polanyi.semantic.generate import build_rule_contexts
from polanyi.execution.validate import validate_sql

RULES = build_rule_contexts(DEMO_BUSINESS_RULES)


def test_dml_statements_are_blocked():
    result = validate_sql("DELETE FROM trades", RULES)
    assert not result.valid
    assert any(v.rule_id == "GUARD-DML" for v in result.violations)


def test_ddl_statements_are_blocked():
    result = validate_sql("DROP TABLE trades", RULES)
    assert not result.valid


def test_select_on_single_table_passes():
    result = validate_sql("SELECT legal_name FROM counterparties LIMIT 5", RULES)
    assert result.valid


def test_trade_counterparty_join_without_sanctions_filter_is_flagged():
    sql = """
    SELECT t.trade_id, c.legal_name
    FROM trades t JOIN counterparties c ON t.counterparty_id = c.counterparty_id
    """
    result = validate_sql(sql, RULES)
    assert not result.valid
    violation = next(v for v in result.violations if v.rule_id == "BR-001")
    assert violation.severity == "CRITICAL"
    assert "is_sanctioned" in violation.message


def test_trade_counterparty_join_with_sanctions_filter_passes():
    sql = """
    SELECT t.trade_id, c.legal_name
    FROM trades t JOIN counterparties c ON t.counterparty_id = c.counterparty_id
    WHERE c.is_sanctioned = 0
    """
    result = validate_sql(sql, RULES)
    assert all(v.rule_id != "BR-001" for v in result.violations)


def test_non_critical_rules_warn_but_do_not_block():
    # BR-003 (VaR threshold, MEDIUM) mentions var_95 on risk_metrics
    sql = "SELECT position_id FROM risk_metrics"
    result = validate_sql(sql, RULES)
    br3 = [v for v in result.violations if v.rule_id == "BR-003"]
    if br3:
        assert result.valid, "MEDIUM severity must not block execution"
