"""Guarded SQL execution — the symbolic gate runs before anything touches the database.

Mirrors the agent's own path (validate, then execute) so a human running a query
through the console is held to exactly the same rules as the agent.
"""

from __future__ import annotations

from sqlalchemy import create_engine, text

from polanyi.models import BusinessRuleContext, SqlExecutionResult
from polanyi.execution.validate import validate_sql


def execute_sql(
    sql: str, rules: list[BusinessRuleContext], db_uri: str
) -> SqlExecutionResult:
    validation = validate_sql(sql, rules)
    if not validation.valid:
        return SqlExecutionResult(validation=validation)

    engine = create_engine(db_uri)
    with engine.connect() as connection:
        result = connection.execute(text(sql))
        columns = list(result.keys())
        rows = [dict(zip(columns, row, strict=True)) for row in result.fetchall()]
    return SqlExecutionResult(validation=validation, columns=columns, rows=rows)
