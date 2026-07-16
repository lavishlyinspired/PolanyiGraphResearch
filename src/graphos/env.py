"""Environment loading shared by CLI and API."""

from __future__ import annotations

import os


def load_dotenv(path: str = ".env") -> None:
    """Minimal .env loader — existing environment variables win."""
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip("'\"")
            if key and key not in os.environ:
                os.environ[key] = value
