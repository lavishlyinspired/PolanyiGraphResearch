"""Memory Runtime: durable session state for agents.

Sessions are LangGraph checkpoints keyed by thread_id. By default they
persist to SQLite in the artifact store (semantics/knowledge/sessions.db)
so conversations survive server restarts; set GRAPHOS_SESSIONS_DB=:memory:
for ephemeral sessions, or point it at another path.
"""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Optional

DEFAULT_SESSIONS_DB = "semantics/knowledge/sessions.db"


def build_checkpointer(path: Optional[str] = None):
    """SqliteSaver at the configured path; InMemorySaver for ':memory:' or
    when the sqlite checkpointer package is unavailable."""
    target = path or os.environ.get("GRAPHOS_SESSIONS_DB", DEFAULT_SESSIONS_DB)
    if target == ":memory:":
        return _in_memory()
    try:
        from langgraph.checkpoint.sqlite import SqliteSaver
    except ImportError:
        return _in_memory()
    Path(target).parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(target, check_same_thread=False)
    return SqliteSaver(connection)


def _in_memory():
    from langgraph.checkpoint.memory import InMemorySaver

    return InMemorySaver()
