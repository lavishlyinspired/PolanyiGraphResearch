"""Ingest the Polanyi Works demo dataset into Databricks (Unity Catalog).

Reads the demo financial database and materializes each table into a target
catalog.schema so the same semantic pipeline can run against Databricks.
"""

from __future__ import annotations

import sqlite3
import tempfile
from pathlib import Path

from polanyi.demo import seed_demo_db

_TYPE_MAP = {
    "INTEGER": "BIGINT",
    "TIMESTAMP": "TIMESTAMP",
    "DATE": "DATE",
    "BOOLEAN": "BOOLEAN",
}


def _databricks_type(sqlite_type: str) -> str:
    upper = sqlite_type.upper().strip()
    if upper.startswith("VARCHAR"):
        return "STRING"
    if upper.startswith("DECIMAL"):
        return upper
    return _TYPE_MAP.get(upper, "STRING")


def _sql_literal(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return str(value)
    escaped = str(value).replace("'", "''")
    return f"'{escaped}'"


def demo_table_statements(catalog: str, schema: str) -> list[str]:
    """Build CREATE/INSERT statements for the demo dataset (pure — no network)."""
    with tempfile.TemporaryDirectory() as tmp:
        db_path = str(Path(tmp) / "demo.db")
        seed_demo_db(db_path)
        con = sqlite3.connect(db_path)
        try:
            statements: list[str] = []
            tables = [
                row[0]
                for row in con.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' "
                    "AND name NOT LIKE 'sqlite_%'"
                )
            ]
            for table in sorted(tables):
                qualified = f"{catalog}.{schema}.{table}"
                columns = con.execute(f"PRAGMA table_info({table})").fetchall()
                col_defs = ", ".join(
                    f"{name} {_databricks_type(col_type)}"
                    for _, name, col_type, *_ in columns
                )
                statements.append(f"CREATE OR REPLACE TABLE {qualified} ({col_defs})")

                rows = con.execute(f"SELECT * FROM {table}").fetchall()
                if rows:
                    values = ", ".join(
                        "(" + ", ".join(_sql_literal(v) for v in row) + ")" for row in rows
                    )
                    statements.append(f"INSERT INTO {qualified} VALUES {values}")
            return statements
        finally:
            con.close()


def ingest_demo_to_databricks(catalog: str | None = None, schema: str = "polanyi_demo") -> int:
    from polanyi.execution.connectors.databricks import DatabricksClient, DatabricksConfig

    config = DatabricksConfig.from_env()
    cat = catalog or config.catalog or "main"

    with DatabricksClient(config) as client:
        print(f"Creating schema {cat}.{schema} ...")
        client.execute_query(f"CREATE SCHEMA IF NOT EXISTS {cat}.{schema}")
        for statement in demo_table_statements(cat, schema):
            label = " ".join(statement.split()[:6])
            print(f"  {label} ...")
            client.execute_query(statement)
    print(f"Demo dataset ingested into {cat}.{schema}")
    print(
        "Query it with: polanyi generate --db "
        f'"databricks://token:$DATABRICKS_TOKEN@<host>/sql/1.0/warehouses/<id>'
        f'?catalog={cat}&schema={schema}"'
    )
    return 0
