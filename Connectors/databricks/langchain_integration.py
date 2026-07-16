from __future__ import annotations

from typing import Any, Optional

from .client import DatabricksClient
from .config import DatabricksConfig


def get_chat_databricks(
    config: Optional[DatabricksConfig] = None,
    endpoint: Optional[str] = None,
    temperature: float = 0.1,
    max_tokens: int = 512,
    **kwargs,
):
    """Create a LangChain ChatDatabricks instance.

    Requires: pip install databricks-langchain
    """
    try:
        from databricks_langchain import ChatDatabricks
    except ImportError:
        raise ImportError(
            "databricks-langchain not installed. Run: pip install databricks-langchain"
        )

    ep = endpoint
    if not ep:
        if config and config.serving_endpoint:
            ep = config.serving_endpoint
        else:
            raise ValueError("endpoint required — set DATABRICKS_SERVING_ENDPOINT or pass endpoint=")

    return ChatDatabricks(
        endpoint=ep,
        temperature=temperature,
        max_tokens=max_tokens,
        **kwargs,
    )


def get_sql_database(
    config: Optional[DatabricksConfig] = None,
    warehouse_id: Optional[str] = None,
    catalog: Optional[str] = None,
    schema_name: Optional[str] = None,
):
    """Create a LangChain SQLDatabase connected to Databricks.

    Requires: pip install langchain-community
    """
    try:
        from langchain_community.utilities import SQLDatabase
    except ImportError:
        raise ImportError(
            "langchain-community not installed. Run: pip install langchain-community"
        )

    cfg = config or DatabricksConfig.from_env()
    wh_id = warehouse_id or cfg.warehouse_id
    cat = catalog or cfg.catalog
    sch = schema_name or cfg.schema_name

    http_path = cfg.http_path or (f"/sql/1.0/warehouses/{wh_id}" if wh_id else None)
    if not http_path:
        raise ValueError("warehouse_id or http_path required for SQLDatabase connection")

    connection_url = f"databricks://token:{cfg.token}@{cfg.server_hostname}{http_path}"
    if cat and sch:
        connection_url += f"?catalog={cat}&schema={sch}"
    elif cat:
        connection_url += f"?catalog={cat}"

    return SQLDatabase.from_uri(connection_url)


def get_vector_search_retriever(
    config: Optional[DatabricksConfig] = None,
    endpoint: Optional[str] = None,
    index_name: Optional[str] = None,
    text_column: str = "text",
    embedding=None,
    columns: Optional[list[str]] = None,
):
    """Create a DatabricksVectorSearch retriever for LangChain.

    Requires: pip install databricks-langchain databricks-vectorsearch
    """
    try:
        from databricks_langchain import DatabricksVectorSearch, DatabricksEmbeddings
    except ImportError:
        raise ImportError(
            "databricks-langchain not installed. Run: pip install databricks-langchain"
        )

    cfg = config or DatabricksConfig.from_env()

    if embedding is None:
        embedding = DatabricksEmbeddings(endpoint="databricks-bge-large-en")

    return DatabricksVectorSearch(
        endpoint=endpoint or "vector-search-endpoint",
        index_name=index_name or "",
        text_column=text_column,
        embedding=embedding,
        columns=columns or [],
    )
