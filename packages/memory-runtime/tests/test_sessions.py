from polanyi.memory import build_checkpointer
from polanyi.memory.sessions import list_sessions


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


def _put_turn(checkpointer, thread_id, human_text, ai_text, ts):
    """Write one real checkpoint via the actual checkpointer API — a
    conversation turn's message list, with a controlled timestamp so
    ordering assertions are deterministic rather than racing the clock."""
    from langchain_core.messages import AIMessage, HumanMessage
    from langgraph.checkpoint.base import empty_checkpoint

    config = {"configurable": {"thread_id": thread_id, "checkpoint_ns": ""}}
    checkpoint = empty_checkpoint()
    checkpoint["ts"] = ts
    checkpoint["channel_values"] = {
        "messages": [HumanMessage(content=human_text), AIMessage(content=ai_text)]
    }
    checkpointer.put(config, checkpoint, {"source": "input", "step": 0}, {})


def test_list_sessions_is_empty_when_nothing_has_run():
    from langgraph.checkpoint.memory import InMemorySaver

    assert list_sessions(InMemorySaver()) == []


def test_list_sessions_reports_one_summary_per_distinct_thread():
    from langgraph.checkpoint.memory import InMemorySaver

    checkpointer = InMemorySaver()
    _put_turn(checkpointer, "t1", "How many trades?", "6 trades.", "2026-01-01T00:00:00Z")
    _put_turn(checkpointer, "t2", "How many counterparties?", "5.", "2026-01-01T00:01:00Z")

    sessions = list_sessions(checkpointer)
    assert {s.session_id for s in sessions} == {"t1", "t2"}


def test_list_sessions_orders_most_recently_updated_first():
    from langgraph.checkpoint.memory import InMemorySaver

    checkpointer = InMemorySaver()
    _put_turn(checkpointer, "older", "first question", "first answer", "2026-01-01T00:00:00Z")
    _put_turn(checkpointer, "newer", "second question", "second answer", "2026-01-01T01:00:00Z")

    sessions = list_sessions(checkpointer)
    assert [s.session_id for s in sessions] == ["newer", "older"]


def test_list_sessions_counts_turns_and_reports_the_latest_question(tmp_path):
    """A second .put() on the same thread simulates a second turn — turn
    count and last_message must reflect the LATEST checkpoint only, not
    every checkpoint ever written for that thread. Uses the real SqliteSaver
    (like test_sessions_survive_checkpointer_reconstruction above) — a
    hand-built InMemorySaver checkpoint doesn't reliably round-trip
    channel_values across multiple .put() calls without also managing
    channel_versions, which isn't this test's concern."""
    from langchain_core.messages import AIMessage, HumanMessage
    from langgraph.checkpoint.base import empty_checkpoint

    checkpointer = build_checkpointer(str(tmp_path / "sessions.db"))
    config = {"configurable": {"thread_id": "t1", "checkpoint_ns": ""}}

    first = empty_checkpoint()
    first["channel_values"] = {
        "messages": [HumanMessage(content="How many trades?"), AIMessage(content="6.")]
    }
    checkpointer.put(config, first, {"source": "input", "step": 0}, {})

    second = empty_checkpoint()
    second["channel_values"] = {
        "messages": [
            HumanMessage(content="How many trades?"),
            AIMessage(content="6."),
            HumanMessage(content="And counterparties?"),
            AIMessage(content="5."),
        ]
    }
    checkpointer.put(config, second, {"source": "input", "step": 1}, {})

    [session] = list_sessions(checkpointer)
    assert session.turn_count == 2
    assert session.last_message == "And counterparties?"


class _FakeCheckpointTuple:
    def __init__(self, thread_id, ts, messages):
        self.config = {"configurable": {"thread_id": thread_id}}
        self.checkpoint = {"ts": ts, "channel_values": {"messages": messages}}


class _FakeCheckpointer:
    """Returns checkpoints out of order for one thread -- proves
    list_sessions() picks the checkpoint with the latest ts, not merely the
    first one .list() happens to yield for that thread. The real
    SqliteSaver/InMemorySaver always yield newest-first, so this case never
    arises against them, but list_sessions() accepts anything with a
    .list() method and shouldn't silently trust iteration order."""

    def __init__(self, tuples):
        self._tuples = tuples

    def list(self, config):
        return iter(self._tuples)


def test_list_sessions_picks_the_latest_by_ts_even_if_not_seen_first():
    from langchain_core.messages import HumanMessage

    checkpointer = _FakeCheckpointer(
        [
            _FakeCheckpointTuple("t1", "2026-01-01T00:00:00Z", [HumanMessage(content="old")]),
            _FakeCheckpointTuple(
                "t1", "2026-01-01T01:00:00Z", [HumanMessage(content="old"), HumanMessage(content="new")]
            ),
        ]
    )
    [session] = list_sessions(checkpointer)
    assert session.last_message == "new"
    assert session.turn_count == 2


def test_list_sessions_respects_the_limit():
    from langgraph.checkpoint.memory import InMemorySaver

    checkpointer = InMemorySaver()
    for i in range(5):
        _put_turn(checkpointer, f"t{i}", "q", "a", f"2026-01-01T00:0{i}:00Z")

    assert len(list_sessions(checkpointer, limit=2)) == 2
