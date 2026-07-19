import pytest

from polanyi.agents.semantic_agent import build_sql_tools
from polanyi.demo import DEMO_BUSINESS_RULES, seed_demo_db
from polanyi.semantic.generate import build_rule_contexts

RULES = build_rule_contexts(DEMO_BUSINESS_RULES)


@pytest.fixture()
def tools(tmp_path):
    db_path = tmp_path / "demo.db"
    seed_demo_db(str(db_path))
    return {t.name: t for t in build_sql_tools(f"sqlite:///{db_path}", RULES)}


def test_list_tables_tool_names_demo_tables(tools):
    out = tools["sql_db_list_tables"].invoke({})
    assert "trades" in out and "counterparties" in out


def test_schema_tool_returns_create_statements(tools):
    out = tools["sql_db_schema"].invoke({"table_names": "trades"})
    assert "CREATE TABLE" in out


def test_query_tool_executes_clean_sql(tools):
    out = tools["sql_db_query"].invoke({"query": "SELECT COUNT(*) FROM instruments"})
    assert "3" in out


def test_query_tool_blocks_rule_violating_sql_with_guidance(tools):
    sql = (
        "SELECT t.trade_id FROM trades t "
        "JOIN counterparties c ON t.counterparty_id = c.counterparty_id"
    )
    out = tools["sql_db_query"].invoke({"query": sql})
    assert "BLOCKED" in out
    assert "is_sanctioned" in out


def test_query_tool_blocks_dml(tools):
    out = tools["sql_db_query"].invoke({"query": "DELETE FROM trades"})
    assert "BLOCKED" in out


# ── SemanticAgent.__init__'s agent-skills wiring ────────────────
#
# Eager inlining, not on-demand middleware: live verification showed the
# model would not reliably call a load_skill tool even with strong
# wording, so the supervisor's system prompt always includes every
# configured skill's full content directly (see agent_skills.py).


@pytest.fixture()
def semantic_agent_kwargs(tmp_path):
    """A real demo db + minimal SemanticContext -- SemanticAgent.__init__
    itself is never touched beyond the system_prompt assembly, so this
    only needs to exercise the wiring, not real agent reasoning."""
    from polanyi.models import SemanticContext

    db_path = tmp_path / "demo.db"
    seed_demo_db(str(db_path))
    return {
        "db_uri": f"sqlite:///{db_path}",
        "context": SemanticContext(domain="test"),
        "llm": object(),
    }


def test_semantic_agent_system_prompt_is_unchanged_when_no_agent_skills_configured(
    semantic_agent_kwargs, monkeypatch
):
    import langchain.agents as langchain_agents
    from polanyi.agents.semantic_agent import SemanticAgent
    import polanyi.kernel.agent_skills as agent_skills_module

    monkeypatch.setattr(agent_skills_module, "load_agent_skills", lambda: [])
    captured = {}

    def fake_create_agent(**kwargs):
        captured.update(kwargs)

        class FakeAgent:
            pass

        return FakeAgent()

    monkeypatch.setattr(langchain_agents, "create_agent", fake_create_agent)

    SemanticAgent(**semantic_agent_kwargs)

    assert "Additional Guidance" not in captured["system_prompt"]


def test_semantic_agent_system_prompt_includes_every_configured_skills_full_content(
    semantic_agent_kwargs, monkeypatch
):
    import langchain.agents as langchain_agents
    from polanyi.agents.semantic_agent import SemanticAgent
    import polanyi.kernel.agent_skills as agent_skills_module

    fake_skills = [{"name": "disambiguation", "description": "desc", "content": "THE FULL GUIDANCE"}]
    monkeypatch.setattr(agent_skills_module, "load_agent_skills", lambda: fake_skills)
    captured = {}

    def fake_create_agent(**kwargs):
        captured.update(kwargs)

        class FakeAgent:
            pass

        return FakeAgent()

    monkeypatch.setattr(langchain_agents, "create_agent", fake_create_agent)

    SemanticAgent(**semantic_agent_kwargs)

    assert "disambiguation" in captured["system_prompt"]
    assert "THE FULL GUIDANCE" in captured["system_prompt"]


# ── SemanticAgent.ask_stream ──────────────────────────────────────
#
# Real-time visibility into what the agent is doing, using LangGraph's
# own stream_mode=["updates", "messages"] (verified directly against the
# installed langchain/langgraph before writing this): "updates" carries
# complete tool_call/tool_result messages as each graph step finishes,
# "messages" carries token-by-token AIMessageChunk content for the
# streamed final answer. Scoped to the supervisor's own top-level steps
# -- a specialist's internal tool calls (inside its own separate
# create_agent().invoke() call) aren't part of this outer stream and
# still only appear in the final consolidated trace, same as today.


class _FakeStreamingAgent:
    def __init__(self, chunks):
        self._chunks = chunks

    def stream(self, input, config, stream_mode=None):
        yield from self._chunks


def _install_fake_streaming_agent(monkeypatch, chunks):
    import langchain.agents as langchain_agents

    monkeypatch.setattr(langchain_agents, "create_agent", lambda **kwargs: _FakeStreamingAgent(chunks))


def test_ask_stream_yields_tool_call_then_tool_result_then_tokens_then_done(
    semantic_agent_kwargs, monkeypatch
):
    from langchain_core.messages import AIMessage, AIMessageChunk, ToolMessage
    from polanyi.agents.semantic_agent import SemanticAgent

    chunks = [
        (
            "updates",
            {
                "model": {
                    "messages": [
                        AIMessage(
                            content="",
                            tool_calls=[{"name": "sql_db_list_tables", "args": {}, "id": "1", "type": "tool_call"}],
                        )
                    ]
                }
            },
        ),
        (
            "updates",
            {
                "tools": {
                    "messages": [
                        ToolMessage(content="trades, accounts", name="sql_db_list_tables", tool_call_id="1")
                    ]
                }
            },
        ),
        ("messages", (AIMessageChunk(content="There"), {})),
        ("messages", (AIMessageChunk(content=" are"), {})),
        ("messages", (AIMessageChunk(content=" 6 trades."), {})),
    ]
    _install_fake_streaming_agent(monkeypatch, chunks)

    agent = SemanticAgent(**semantic_agent_kwargs)
    events = list(agent.ask_stream("How many trades?", session_id="s1"))

    assert events[0] == {"type": "tool_call", "name": "sql_db_list_tables", "detail": "{}"}
    assert events[1] == {"type": "tool_result", "name": "sql_db_list_tables", "detail": "trades, accounts"}
    assert events[2] == {"type": "token", "content": "There"}
    assert events[3] == {"type": "token", "content": " are"}
    assert events[4] == {"type": "token", "content": " 6 trades."}


def test_ask_stream_ends_with_a_done_event_carrying_the_real_assembled_answer(
    semantic_agent_kwargs, monkeypatch
):
    from langchain_core.messages import AIMessageChunk
    from polanyi.agents.semantic_agent import SemanticAgent

    chunks = [
        ("messages", (AIMessageChunk(content="Real "), {})),
        ("messages", (AIMessageChunk(content="answer."), {})),
    ]
    _install_fake_streaming_agent(monkeypatch, chunks)

    agent = SemanticAgent(**semantic_agent_kwargs)
    events = list(agent.ask_stream("q", session_id="s1"))

    assert events[-1] == {"type": "done", "answer": "Real answer."}


def test_ask_stream_ignores_empty_content_chunks_during_tool_calling(semantic_agent_kwargs, monkeypatch):
    """A tool-calling turn's AIMessageChunk has empty content (the real
    text is in tool_call_chunks, not .content) -- these must not surface
    as fabricated empty token events."""
    from langchain_core.messages import AIMessageChunk
    from polanyi.agents.semantic_agent import SemanticAgent

    chunks = [("messages", (AIMessageChunk(content=""), {}))]
    _install_fake_streaming_agent(monkeypatch, chunks)

    agent = SemanticAgent(**semantic_agent_kwargs)
    events = list(agent.ask_stream("q", session_id="s1"))

    assert events == [{"type": "done", "answer": ""}]
