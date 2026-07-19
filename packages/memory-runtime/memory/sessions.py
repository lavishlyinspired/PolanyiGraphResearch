"""Session listing: real metadata derived from the checkpointer's own state.

No separate session store — the LangGraph checkpointer already has
everything (thread_id, message history, timestamps) a "recent
conversations" view needs.
"""

from __future__ import annotations

from polanyi.models import SessionSummary


def list_sessions(checkpointer, limit: int = 50) -> list[SessionSummary]:
    """Every distinct thread_id, most-recently-updated first.

    Each thread may have many checkpoints (one per turn); only the latest
    checkpoint per thread contributes turn_count/last_message, since earlier
    checkpoints are subsets of the same growing message list.
    """
    from langchain_core.messages import HumanMessage

    latest_by_thread: dict[str, object] = {}
    for tup in checkpointer.list(None):
        thread_id = tup.config["configurable"]["thread_id"]
        existing = latest_by_thread.get(thread_id)
        if existing is None or tup.checkpoint.get("ts", "") > existing.checkpoint.get("ts", ""):
            latest_by_thread[thread_id] = tup

    summaries = []
    for thread_id, tup in latest_by_thread.items():
        messages = tup.checkpoint.get("channel_values", {}).get("messages") or []
        human_messages = [m for m in messages if isinstance(m, HumanMessage)]
        summaries.append(
            SessionSummary(
                session_id=thread_id,
                turn_count=len(human_messages),
                last_message=str(human_messages[-1].content) if human_messages else "",
                updated_at=str(tup.checkpoint.get("ts", "")),
            )
        )
    summaries.sort(key=lambda s: s.updated_at, reverse=True)
    return summaries[:limit]
