from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class DatabricksConfig:
    """Immutable configuration for Databricks connections."""

    host: str
    token: Optional[str] = None
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    workspace_id: Optional[str] = None
    warehouse_id: Optional[str] = None
    serving_endpoint: Optional[str] = None
    catalog: Optional[str] = None
    schema_name: Optional[str] = None
    http_path: Optional[str] = None
    auth_type: str = "pat"
    timeout_seconds: int = 60
    retry_max_attempts: int = 3

    @classmethod
    def from_env(cls, env_path: Optional[str] = None) -> DatabricksConfig:
        """Load config from environment variables. Optionally load a .env file first."""
        if env_path:
            _load_dotenv(env_path)

        host = os.environ.get("DATABRICKS_HOST", "")
        if not host:
            raise ValueError(
                "DATABRICKS_HOST is required. "
                "Set it to your workspace URL (e.g. https://dbc-xxxxxx.cloud.databricks.com)"
            )

        auth_type = "pat"
        if os.environ.get("DATABRICKS_CLIENT_ID") and os.environ.get("DATABRICKS_CLIENT_SECRET"):
            auth_type = "oauth-m2m"

        return cls(
            host=host.rstrip("/"),
            token=os.environ.get("DATABRICKS_TOKEN"),
            client_id=os.environ.get("DATABRICKS_CLIENT_ID"),
            client_secret=os.environ.get("DATABRICKS_CLIENT_SECRET"),
            workspace_id=os.environ.get("DATABRICKS_WORKSPACE_ID"),
            warehouse_id=os.environ.get("DATABRICKS_WAREHOUSE_ID"),
            serving_endpoint=os.environ.get("DATABRICKS_SERVING_ENDPOINT"),
            catalog=os.environ.get("DATABRICKS_CATALOG"),
            schema_name=os.environ.get("DATABRICKS_SCHEMA"),
            http_path=os.environ.get("DATABRICKS_HTTP_PATH"),
            auth_type=auth_type,
        )

    @property
    def server_hostname(self) -> str:
        """Extract hostname from host URL for SQL connector."""
        return self.host.replace("https://", "").replace("http://", "")

    def validate(self) -> list[str]:
        """Return list of missing-but-recommended fields."""
        warnings = []
        if not self.token and not (self.client_id and self.client_secret):
            warnings.append("No auth credentials: set DATABRICKS_TOKEN or CLIENT_ID+CLIENT_SECRET")
        if not self.warehouse_id:
            warnings.append("No DATABRICKS_WAREHOUSE_ID — SQL execution will require explicit warehouse_id")
        if not self.serving_endpoint:
            warnings.append("No DATABRICKS_SERVING_ENDPOINT — LLM calls will require explicit endpoint")
        return warnings


def _load_dotenv(path: str) -> None:
    """Minimal .env loader — no external dependency needed."""
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip("'\"")
            if key and key not in os.environ:
                os.environ[key] = value
