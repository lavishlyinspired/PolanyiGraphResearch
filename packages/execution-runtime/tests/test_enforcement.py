from polanyi.models import EnforcementEvent, ValidationResult, Violation
from polanyi.execution.enforcement import events_for, summarize


def _result(checked_rules=None, violations=None) -> ValidationResult:
    return ValidationResult(
        valid=not any(v.severity == "CRITICAL" for v in (violations or [])),
        violations=violations or [],
        checked_rules=checked_rules or [],
    )


def test_a_checked_rule_with_no_violation_produces_one_passed_event():
    result = _result(checked_rules=["BR-002"])
    events = events_for("SELECT 1", result, "validate", "2026-07-19T12:00:00")
    assert events == [
        EnforcementEvent(rule_id="BR-002", verdict="passed", sql="SELECT 1", timestamp="2026-07-19T12:00:00", source="validate")
    ]


def test_a_checked_rule_with_a_violation_produces_one_blocked_event_not_two():
    result = _result(
        checked_rules=["BR-001"],
        violations=[Violation(rule_id="BR-001", severity="CRITICAL", message="blocked")],
    )
    events = events_for("SELECT 1", result, "validate", "2026-07-19T12:00:00")
    assert len(events) == 1
    assert events[0].verdict == "blocked"


def test_a_violation_outside_checked_rules_still_produces_its_own_event():
    # GUARD-DML fires before the business-rule loop runs, so it never
    # appears in checked_rules -- it must still be reported.
    result = _result(
        checked_rules=[],
        violations=[Violation(rule_id="GUARD-DML", severity="CRITICAL", message="DML blocked")],
    )
    events = events_for("DELETE FROM trades", result, "validate", "2026-07-19T12:00:00")
    assert events == [
        EnforcementEvent(rule_id="GUARD-DML", verdict="blocked", sql="DELETE FROM trades", timestamp="2026-07-19T12:00:00", source="validate")
    ]


def test_a_non_critical_violation_is_flagged_not_blocked():
    # Only CRITICAL severity actually blocks a query from running (see
    # validate_sql's `blocking = {"CRITICAL"}`); HIGH/MEDIUM/LOW/INFO
    # violations are advisory. Conflating them into "blocked" would
    # misrepresent queries that ran successfully with a warning.
    result = _result(
        checked_rules=["BR-003"],
        violations=[Violation(rule_id="BR-003", severity="MEDIUM", message="advisory")],
    )
    events = events_for("SELECT 1", result, "validate", "2026-07-19T12:00:00")
    assert events == [
        EnforcementEvent(rule_id="BR-003", verdict="flagged", sql="SELECT 1", timestamp="2026-07-19T12:00:00", source="validate")
    ]


def test_mixed_result_reports_each_rule_with_its_own_real_verdict():
    result = _result(
        checked_rules=["BR-001", "BR-002"],
        violations=[Violation(rule_id="BR-001", severity="CRITICAL", message="blocked")],
    )
    events = events_for("SELECT 1", result, "validate", "2026-07-19T12:00:00")
    by_rule = {e.rule_id: e.verdict for e in events}
    assert by_rule == {"BR-001": "blocked", "BR-002": "passed"}


def test_no_events_are_fabricated_for_an_empty_result():
    events = events_for("SELECT 1", _result(), "validate", "2026-07-19T12:00:00")
    assert events == []


def test_records_the_real_source_the_check_came_from():
    events = events_for("SELECT 1", _result(checked_rules=["BR-002"]), "agent", "2026-07-19T12:00:00")
    assert events[0].source == "agent"


def test_summarize_returns_no_rules_for_an_empty_event_list():
    assert summarize([]) == {}


def _event(rule_id: str, verdict: str) -> EnforcementEvent:
    return EnforcementEvent(rule_id=rule_id, verdict=verdict, sql="SELECT 1", timestamp="t", source="validate")


def test_summarize_counts_passed_flagged_and_blocked_independently_per_rule():
    events = [
        _event("BR-001", "blocked"),
        _event("BR-001", "blocked"),
        _event("BR-001", "flagged"),
        _event("BR-001", "passed"),
    ]
    assert summarize(events) == {"BR-001": {"passed": 1, "flagged": 1, "blocked": 2}}


def test_summarize_never_conflates_two_different_rules():
    events = [_event("BR-001", "blocked"), _event("BR-002", "passed")]
    assert summarize(events) == {
        "BR-001": {"passed": 0, "flagged": 0, "blocked": 1},
        "BR-002": {"passed": 1, "flagged": 0, "blocked": 0},
    }
