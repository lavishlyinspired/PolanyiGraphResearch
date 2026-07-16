from __future__ import annotations

import logging
from contextlib import contextmanager
from typing import Any, Generator, Optional

import databricks.sql as dbsql
from databricks.sdk import WorkspaceClient
from databricks.sdk.core import Config
from databricks.sdk.errors import (
    BadRequest,
    NotFound,
    PermissionDenied,
    ResourceDoesNotExist,
    TooManyRequests,
)
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from .config import DatabricksConfig

logger = logging.getLogger(__name__)


class DatabricksClient:
    """Unified client for Databricks SQL, workspace APIs, and model serving."""

    def __init__(self, config: DatabricksConfig):
        self.config = config
        self._sdk: Optional[WorkspaceClient] = None
        self._sql_conn: Optional[dbsql.Connection] = None

    # ── SDK client (lazy) ───────────────────────────────────────────

    @property
    def sdk(self) -> WorkspaceClient:
        if self._sdk is None:
            kwargs: dict[str, Any] = {
                "host": self.config.host,
            }
            if self.config.auth_type == "oauth-m2m":
                kwargs["client_id"] = self.config.client_id
                kwargs["client_secret"] = self.config.client_secret
            elif self.config.token:
                kwargs["token"] = self.config.token
            self._sdk = WorkspaceClient(**kwargs)
        return self._sdk

    # ── SQL connection (lazy, reusable) ─────────────────────────────

    def _get_sql_connection(
        self, warehouse_id: Optional[str] = None
    ) -> dbsql.Connection:
        if self._sql_conn is not None:
            return self._sql_conn

        wh_id = warehouse_id or self.config.warehouse_id
        if not wh_id:
            raise ValueError("warehouse_id required — set DATABRICKS_WAREHOUSE_ID or pass explicitly")

        connect_kwargs: dict[str, Any] = {
            "server_hostname": self.config.server_hostname,
            "http_path": self.config.http_path or f"/sql/1.0/warehouses/{wh_id}",
        }

        if self.config.token:
            connect_kwargs["access_token"] = self.config.token
        elif self.config.client_id and self.config.client_secret:
            connect_kwargs["credentials_provider"] = self._make_oauth_provider(wh_id)

        self._sql_conn = dbsql.connect(**connect_kwargs)
        return self._sql_conn

    def _make_oauth_provider(self, warehouse_id: str):
        """Create an OAuth credential provider for SQL connector."""

        def credential_provider():
            config = Config(
                host=self.config.host,
                client_id=self.config.client_id,
                client_secret=self.config.client_secret,
            )
            from databricks.sdk.core import oauth_service_principal

            return oauth_service_principal(config)

        return credential_provider

    @contextmanager
    def sql_cursor(self, warehouse_id: Optional[str] = None) -> Generator:
        """Context manager yielding a SQL cursor with automatic cleanup."""
        conn = self._get_sql_connection(warehouse_id)
        cursor = conn.cursor()
        try:
            yield cursor
        finally:
            cursor.close()

    # ── SQL execution ───────────────────────────────────────────────

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((TooManyRequests, ConnectionError, TimeoutError)),
        reraise=True,
    )
    def execute_query(
        self,
        query: str,
        params: Optional[list[Any]] = None,
        warehouse_id: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """Execute a SQL query and return rows as list of dicts."""
        with self.sql_cursor(warehouse_id) as cursor:
            cursor.execute(query, params or [])
            columns = [desc[0] for desc in cursor.description] if cursor.description else []
            rows = cursor.fetchall()
            return [dict(zip(columns, row)) for row in rows]

    def execute_query_df(
        self,
        query: str,
        params: Optional[list[Any]] = None,
        warehouse_id: Optional[str] = None,
    ):
        """Execute a SQL query and return a Pandas DataFrame."""
        with self.sql_cursor(warehouse_id) as cursor:
            cursor.execute(query, params or [])
            return cursor.fetchall_arrow().to_pandas()

    # ── Model serving ───────────────────────────────────────────────

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((TooManyRequests, ConnectionError)),
        reraise=True,
    )
    def query_serving_endpoint(
        self,
        endpoint: Optional[str] = None,
        messages: Optional[list[dict[str, str]]] = None,
        **kwargs,
    ) -> dict[str, Any]:
        """Query a Databricks model serving endpoint (OpenAI-compatible)."""
        ep = endpoint or self.config.serving_endpoint
        if not ep:
            raise ValueError("serving_endpoint required — set DATABRICKS_SERVING_ENDPOINT or pass explicitly")

        payload = {"messages": messages or [], **kwargs}
        response = self.sdk.serving_endpoints.query(name=ep, **payload)
        return response

    def get_openai_client(self, endpoint: Optional[str] = None):
        """Get an OpenAI-compatible client from a serving endpoint."""
        ep = endpoint or self.config.serving_endpoint
        if not ep:
            raise ValueError("serving_endpoint required")
        return self.sdk.serving_endpoints.get_open_ai_client(endpoint_name=ep)

    # ── Workspace operations ────────────────────────────────────────

    def list_catalogs(self) -> list[str]:
        """List available catalogs."""
        return [c.name for c in self.sdk.catalogs.list()]

    def list_schemas(self, catalog: Optional[str] = None) -> list[str]:
        """List schemas in a catalog."""
        cat = catalog or self.config.catalog or "hive_metastore"
        return [s.name for s in self.sdk.schemas.list(catalog_name=cat)]

    def list_tables(self, catalog: Optional[str] = None, schema: Optional[str] = None) -> list[dict]:
        """List tables in a schema."""
        cat = catalog or self.config.catalog or "hive_metastore"
        sch = schema or self.config.schema_name or "default"
        tables = []
        for t in self.sdk.tables.list(catalog_name=cat, schema_name=sch):
            tables.append({
                "name": t.name,
                "table_type": t.table_type,
                "data_source_format": t.data_source_format,
                "comment": t.comment,
            })
        return tables

    def list_serving_endpoints(self) -> list[dict]:
        """List available serving endpoints."""
        endpoints = []
        for ep in self.sdk.serving_endpoints.list():
            endpoints.append({
                "name": ep.name,
                "state": ep.state,
                "creator": ep.creator,
            })
        return endpoints

    # ── Lifecycle ───────────────────────────────────────────────────

    def close(self) -> None:
        """Clean up connections."""
        if self._sql_conn:
            self._sql_conn.close()
            self._sql_conn = None

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
