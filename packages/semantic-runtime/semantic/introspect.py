"""Database schema introspection — the first stage of the semantic pipeline."""

from __future__ import annotations

from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from sqlalchemy import create_engine, inspect as sa_inspect

from polanyi.models import ColumnInfo, ForeignKeyInfo, SchemaSnapshot, TableInfo


def _normalize_databricks_uri(db_uri: str) -> str:
    """Convert a user-friendly Databricks URI to the format expected by databricks-sqlalchemy.

    Accepts:  databricks://token:PASS@HOST/sql/1.0/warehouses/WH?catalog=C&schema=S
    Returns:  databricks+thrift://token:PASS@HOST?http_path=/sql/1.0/warehouses/WH&catalog=C&schema=S
    """
    if not db_uri.startswith("databricks://"):
        return db_uri

    parsed = urlparse(db_uri)
    # Extract the path (e.g. /sql/1.0/warehouses/abc123) as http_path
    http_path = parsed.path
    query = parse_qs(parsed.query, keep_blank_values=True)

    # Flatten single-value lists from parse_qs
    flat_query = {k: v[0] if len(v) == 1 else v for k, v in query.items()}
    if http_path:
        flat_query["http_path"] = http_path

    # Rebuild with no path (http_path moved to query params)
    rebuilt = parsed._replace(
        path="",
        query=urlencode(flat_query),
    )
    return urlunparse(rebuilt)


def introspect(db_uri: str) -> SchemaSnapshot:
    """Read tables, columns, and foreign keys from any SQLAlchemy-compatible database."""
    engine = create_engine(_normalize_databricks_uri(db_uri))
    try:
        inspector = sa_inspect(engine)
        tables = [
            TableInfo(
                name=table_name,
                columns=_columns_for(inspector, table_name),
                foreign_keys=_foreign_keys_for(inspector, table_name),
            )
            for table_name in sorted(inspector.get_table_names())
        ]
        return SchemaSnapshot(
            dialect=engine.dialect.name,
            tables=tables,
        )
    finally:
        engine.dispose()


def _columns_for(inspector, table_name: str) -> list[ColumnInfo]:
    pk_columns = set(inspector.get_pk_constraint(table_name).get("constrained_columns") or [])
    return [
        ColumnInfo(
            name=col["name"],
            type=str(col["type"]),
            nullable=bool(col.get("nullable", True)),
            primary_key=col["name"] in pk_columns,
        )
        for col in inspector.get_columns(table_name)
    ]


def _foreign_keys_for(inspector, table_name: str) -> list[ForeignKeyInfo]:
    fks = []
    for fk in inspector.get_foreign_keys(table_name):
        for local, remote in zip(
            fk.get("constrained_columns") or [], fk.get("referred_columns") or []
        ):
            fks.append(
                ForeignKeyInfo(
                    column=local,
                    references_table=fk["referred_table"],
                    references_column=remote,
                )
            )
    return fks


def table_info_text_for(db_uri: str) -> str:
    """Rich CREATE TABLE + sample-row text for LLM prompts (LangChain SQLDatabase).

    Computed lazily, on demand — only called from the LLM enrichment path,
    since it needs a second DB connection and the LangChain import, and the
    deterministic engine never needs it.
    """
    from langchain_community.utilities import SQLDatabase

    return SQLDatabase.from_uri(_normalize_databricks_uri(db_uri)).get_table_info()
