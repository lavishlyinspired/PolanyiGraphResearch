# graphos.memory

The Memory Runtime: durable session state for agents.

Sessions are LangGraph checkpoints keyed by `session_id`, persisted to SQLite
in the artifact store (`semantics/knowledge/sessions.db`) so conversations
survive server restarts. `GRAPHOS_SESSIONS_DB` overrides the path;
`:memory:` forces ephemeral sessions.

Code: `graphos/memory/` (+ `tests/`) — part of the single `graphos`
distribution (mapped in the root `pyproject.toml`).
