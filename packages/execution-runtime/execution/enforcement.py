"""Enforcement-event derivation — pure computation of real per-rule
pass/blocked events from an actual ValidationResult. Callers own persistence
(an in-memory list today); this module only knows how to expand one
validation run into its per-rule events, and how to fold events into counts.
"""

from __future__ import annotations

from polanyi.models import EnforcementEvent, ValidationResult

# Only CRITICAL severity actually stops a query from running (validate_sql's
# `blocking = {"CRITICAL"}`); anything else is advisory. A rule that produced
# a lower-severity violation is reported as "flagged", not "blocked" --
# conflating the two would misrepresent a query that ran with a warning.
_BLOCKING_SEVERITIES = {"CRITICAL"}


def events_for(sql: str, result: ValidationResult, source: str, timestamp: str) -> list[EnforcementEvent]:
    severity_by_rule = {v.rule_id: v.severity for v in result.violations}
    rule_ids = list(dict.fromkeys([*result.checked_rules, *severity_by_rule]))

    def verdict_for(rule_id: str) -> str:
        severity = severity_by_rule.get(rule_id)
        if severity is None:
            return "passed"
        return "blocked" if severity in _BLOCKING_SEVERITIES else "flagged"

    return [
        EnforcementEvent(rule_id=rule_id, verdict=verdict_for(rule_id), sql=sql, timestamp=timestamp, source=source)
        for rule_id in rule_ids
    ]


def summarize(events: list[EnforcementEvent]) -> dict[str, dict[str, int]]:
    counts: dict[str, dict[str, int]] = {}
    for event in events:
        bucket = counts.setdefault(event.rule_id, {"passed": 0, "flagged": 0, "blocked": 0})
        bucket[event.verdict] += 1
    return counts
