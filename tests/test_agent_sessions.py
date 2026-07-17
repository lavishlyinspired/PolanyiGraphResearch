from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from graphos.agent import trace_from_messages


def two_turn_conversation():
    return [
        HumanMessage(content="How many trades?"),
        AIMessage(
            content="",
            tool_calls=[{"name": "sql_db_query", "args": {"query": "SELECT 1"}, "id": "c1"}],
        ),
        ToolMessage(content="[(6,)]", name="sql_db_query", tool_call_id="c1"),
        AIMessage(content="There are 6 trades."),
        HumanMessage(content="And how many counterparties?"),
        AIMessage(
            content="",
            tool_calls=[{"name": "sql_db_query", "args": {"query": "SELECT 2"}, "id": "c2"}],
        ),
        ToolMessage(content="[(5,)]", name="sql_db_query", tool_call_id="c2"),
        AIMessage(content="There are 5 counterparties."),
    ]


def test_trace_covers_only_the_current_turn():
    steps = trace_from_messages(two_turn_conversation(), "And how many counterparties?")
    details = " ".join(s.detail for s in steps)
    assert "SELECT 2" in details
    assert "SELECT 1" not in details, "prior turns must not leak into the trace"


def test_trace_ends_with_final_answer():
    steps = trace_from_messages(two_turn_conversation(), "And how many counterparties?")
    assert steps[-1].kind == "answer"
    assert "5 counterparties" in steps[-1].detail


def test_trace_of_unknown_question_falls_back_to_full_history():
    steps = trace_from_messages(two_turn_conversation(), "never asked")
    assert steps[-1].kind == "answer"
