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


# ── SemanticAgent.__init__'s middleware wiring (S24) ────────────────


@pytest.fixture()
def semantic_agent_kwargs(tmp_path):
    """A real demo db + minimal SemanticContext -- SemanticAgent.__init__
    itself is never touched beyond the middleware= line, so this only
    needs to exercise the wiring, not real agent reasoning."""
    from polanyi.models import SemanticContext

    db_path = tmp_path / "demo.db"
    seed_demo_db(str(db_path))
    return {
        "db_uri": f"sqlite:///{db_path}",
        "context": SemanticContext(domain="test"),
        "llm": object(),
    }


def test_semantic_agent_passes_empty_middleware_when_no_agent_skills_configured(
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

    assert captured["middleware"] == []


def test_semantic_agent_passes_the_real_skill_middleware_when_configured(
    semantic_agent_kwargs, monkeypatch
):
    import langchain.agents as langchain_agents
    from polanyi.agents.semantic_agent import SemanticAgent
    import polanyi.kernel.agent_skills as agent_skills_module

    fake_skills = [{"name": "disambiguation", "description": "desc", "content": "content"}]
    monkeypatch.setattr(agent_skills_module, "load_agent_skills", lambda: fake_skills)
    captured = {}

    def fake_create_agent(**kwargs):
        captured.update(kwargs)

        class FakeAgent:
            pass

        return FakeAgent()

    monkeypatch.setattr(langchain_agents, "create_agent", fake_create_agent)

    SemanticAgent(**semantic_agent_kwargs)

    assert len(captured["middleware"]) == 1
    tool_names = {t.name for t in captured["middleware"][0].tools}
    assert "load_skill" in tool_names
