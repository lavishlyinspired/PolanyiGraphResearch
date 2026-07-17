# polanyi.memory

The Memory Runtime: durable session state for agents.

Sessions are LangGraph checkpoints keyed by `session_id`, persisted to SQLite
in the artifact store (`semantics/knowledge/sessions.db`) so conversations
survive server restarts. `POLANYI_SESSIONS_DB` overrides the path;
`:memory:` forces ephemeral sessions.

Code: `polanyi/memory/` (+ `tests/`) — part of the single `polanyi`
distribution (mapped in the root `pyproject.toml`).
