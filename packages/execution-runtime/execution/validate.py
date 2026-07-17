"""Symbolic SQL validation — the deterministic guard between agent and database.

The LLM proposes SQL; these checks decide whether it may run. Rules are not
evaluated by the model: they are enforced in code, which is the neurosymbolic
split the Polanyi Works design docs call for (LLM reasons, symbols decide).
"""

from __future__ import annotations

import re

from polanyi.models import BusinessRuleContext, ValidationResult, Violation

_READ_ONLY_STARTERS = {"select", "with"}
_COMMENT_PATTERN = re.compile(r"(--[^\n]*|/\*.*?\*/)", re.DOTALL)
_STOPWORDS = {"be", "is", "are", "must", "the", "a", "an", "than", "then", "where", "and", "or"}


def validate_sql(sql: str, rules: list[BusinessRuleContext]) -> ValidationResult:
    violations = _guard_read_only(sql)
    checked: list[str] = []

    for rule in rules:
        columns = _hint_columns(rule)
        if not columns or not rule.affected_entities:
            continue
        if not _references_all_tables(sql, rule.affected_entities):
            continue
        checked.append(rule.rule_id)
        if not _references_any_column(sql, columns):
            violations.append(
                Violation(
                    rule_id=rule.rule_id,
                    severity=rule.severity,
                    message=(
                        f"{rule.name}: query touches {', '.join(rule.affected_entities)} "
                        f"but does not handle {', '.join(sorted(columns))}. "
                        f"Rule: {rule.description}"
                    ),
                )
            )

    blocking = {"CRITICAL"}
    valid = not any(v.severity in blocking for v in violations)
    return ValidationResult(valid=valid, violations=violations, checked_rules=checked)


def _guard_read_only(sql: str) -> list[Violation]:
    stripped = _COMMENT_PATTERN.sub(" ", sql)
    for statement in stripped.split(";"):
        tokens = statement.split()
        if not tokens:
            continue
        if tokens[0].lower() not in _READ_ONLY_STARTERS:
            return [
                Violation(
                    rule_id="GUARD-DML",
                    severity="CRITICAL",
                    message=(
                        f"Only read-only SELECT statements are allowed; got '{tokens[0]}'."
                    ),
                )
            ]
    return []


def _hint_columns(rule: BusinessRuleContext) -> set[str]:
    columns = set()
    for hint in rule.sql_hints:
        left = hint.split()[0] if hint.split() else ""
        column = left.split(".")[-1].strip("()'\"").lower()
        if column and column not in _STOPWORDS and re.fullmatch(r"[a-z_][a-z0-9_]*", column):
            columns.add(column)
    return columns


def _references_all_tables(sql: str, tables: list[str]) -> bool:
    lowered = sql.lower()
    return all(re.search(rf"\b{re.escape(t.lower())}\b", lowered) for t in tables)


def _references_any_column(sql: str, columns: set[str]) -> bool:
    lowered = sql.lower()
    return any(re.search(rf"\b{re.escape(c)}\b", lowered) for c in columns)
