"""Database schema introspection — the first stage of the semantic pipeline."""

from __future__ import annotations

from sqlalchemy import create_engine, inspect as sa_inspect

from graphos.models import ColumnInfo, ForeignKeyInfo, SchemaSnapshot, TableInfo


def introspect(db_uri: str) -> SchemaSnapshot:
    """Read tables, columns, and foreign keys from any SQLAlchemy-compatible database."""
    engine = create_engine(db_uri)
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
            table_info_text=_table_info_text(db_uri),
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


def _table_info_text(db_uri: str) -> str:
    """Rich CREATE TABLE + sample-row text for LLM prompts (LangChain SQLDatabase)."""
    from langchain_community.utilities import SQLDatabase

    return SQLDatabase.from_uri(db_uri).get_table_info()
