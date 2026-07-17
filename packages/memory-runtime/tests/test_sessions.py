from polanyi.memory import build_checkpointer


def test_sqlite_checkpointer_is_created_at_configured_path(tmp_path):
    db_path = tmp_path / "sessions" / "sessions.db"
    checkpointer = build_checkpointer(str(db_path))
    assert type(checkpointer).__name__ == "SqliteSaver"
    assert db_path.parent.exists()


def test_memory_sentinel_forces_in_memory_sessions(monkeypatch):
    monkeypatch.setenv("POLANYI_SESSIONS_DB", ":memory:")
    checkpointer = build_checkpointer()
    assert type(checkpointer).__name__ == "InMemorySaver"


def test_env_var_sets_session_db_location(tmp_path, monkeypatch):
    db_path = tmp_path / "custom.db"
    monkeypatch.setenv("POLANYI_SESSIONS_DB", str(db_path))
    checkpointer = build_checkpointer()
    assert type(checkpointer).__name__ == "SqliteSaver"


def test_sessions_survive_checkpointer_reconstruction(tmp_path):
    """The point of durable sessions: state persists across process restarts."""
    from langchain_core.messages import HumanMessage
    from langgraph.checkpoint.base import empty_checkpoint

    db_path = str(tmp_path / "sessions.db")
    config = {"configurable": {"thread_id": "t1", "checkpoint_ns": ""}}

    first = build_checkpointer(db_path)
    checkpoint = empty_checkpoint()
    checkpoint["channel_values"] = {"messages": [HumanMessage(content="hello")]}
    first.put(config, checkpoint, {"source": "input", "step": 0}, {})

    second = build_checkpointer(db_path)
    restored = second.get(config)
    assert restored is not None
    assert restored["channel_values"]["messages"][0].content == "hello"
