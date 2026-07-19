import pytest

from polanyi.kernel.capabilities import CapabilityRegistry
from polanyi.kernel.specialists import (
    build_specialist_tool,
    load_specialists,
    parse_skill_md,
)


# ── parse_skill_md ──────────────────────────────────────────────


def test_parse_skill_md_extracts_name_description_and_instructions():
    text = (
        "---\n"
        "name: ontology\n"
        "description: FIBO ontology specialist.\n"
        "---\n"
        "\n"
        "You are a FIBO ontology expert.\n"
    )
    name, description, instructions = parse_skill_md(text)
    assert name == "ontology"
    assert description == "FIBO ontology specialist."
    assert instructions == "You are a FIBO ontology expert."


def test_parse_skill_md_preserves_colons_within_a_field_value():
    text = (
        "---\n"
        "name: ontology\n"
        "description: Use for X: Y and Z questions.\n"
        "---\n"
        "\n"
        "body\n"
    )
    _, description, _ = parse_skill_md(text)
    assert description == "Use for X: Y and Z questions."


def test_parse_skill_md_raises_for_missing_frontmatter_delimiters():
    with pytest.raises(ValueError):
        parse_skill_md("# Just a heading, no frontmatter\n")


def test_parse_skill_md_raises_for_missing_name_field():
    text = "---\ndescription: no name field\n---\n\nbody\n"
    with pytest.raises(ValueError):
        parse_skill_md(text)


def test_parse_skill_md_raises_for_missing_description_field():
    text = "---\nname: ontology\n---\n\nbody\n"
    with pytest.raises(ValueError):
        parse_skill_md(text)


# ── build_specialist_tool ──────────────────────────────────────


class _FakeAgent:
    def __init__(self, messages):
        self._messages = messages
        self.invoked_with = None

    def invoke(self, payload):
        self.invoked_with = payload
        return {"messages": self._messages}


def _configure_llm(monkeypatch, llm=None):
    llm = llm if llm is not None else object()
    monkeypatch.setattr("polanyi.kernel.llm.resolve_llm", lambda role: llm)
    return llm


def test_build_specialist_tool_wrapped_name_and_description():
    wrapped = build_specialist_tool("ontology", "FIBO specialist description", "instructions", [])
    assert wrapped.name == "ask_ontology_specialist"
    assert wrapped.description == "FIBO specialist description"


def test_build_specialist_tool_returns_honest_message_when_no_llm_configured(monkeypatch):
    monkeypatch.setattr("polanyi.kernel.llm.resolve_llm", lambda role: None)
    wrapped = build_specialist_tool("ontology", "desc", "instructions", [])
    result = wrapped.invoke({"question": "what is a bond?"})
    assert "llm" in result.lower()
    assert "configured" in result.lower()


def test_build_specialist_tool_passes_the_real_tool_subset_and_system_prompt(monkeypatch):
    import langchain.agents as langchain_agents
    from langchain_core.messages import AIMessage

    captured = {}

    def fake_create_agent(**kwargs):
        captured.update(kwargs)
        return _FakeAgent([AIMessage(content="the answer")])

    monkeypatch.setattr(langchain_agents, "create_agent", fake_create_agent)
    _configure_llm(monkeypatch)

    fake_tools = [object(), object()]
    wrapped = build_specialist_tool("ontology", "desc", "instructions text", fake_tools)
    wrapped.invoke({"question": "what is a bond?"})

    assert captured["tools"] == fake_tools
    assert captured["system_prompt"] == "instructions text"
    assert "checkpointer" not in captured


def test_build_specialist_tool_resolves_the_agent_tier_llm_not_pipeline(monkeypatch):
    """Real gap found via live verification against GraphDB: the "pipeline"
    (cheap/fast) tier failed to sequence search_ontology -> expand_ontology
    correctly for a real 2-step question, while the "agent" tier answered
    correctly. Specialists need the same multi-step tool-reasoning strength
    as the supervisor -- locking this down so it can't silently regress."""
    import langchain.agents as langchain_agents
    from langchain_core.messages import AIMessage

    monkeypatch.setattr(langchain_agents, "create_agent", lambda **kw: _FakeAgent([AIMessage(content="ok")]))
    requested_roles = []
    monkeypatch.setattr(
        "polanyi.kernel.llm.resolve_llm", lambda role: requested_roles.append(role) or object()
    )

    wrapped = build_specialist_tool("ontology", "desc", "instructions", [])
    wrapped.invoke({"question": "q"})

    assert requested_roles == ["agent"]


def test_build_specialist_tool_extracts_the_final_message_content(monkeypatch):
    import langchain.agents as langchain_agents
    from langchain_core.messages import AIMessage

    monkeypatch.setattr(
        langchain_agents, "create_agent", lambda **kw: _FakeAgent([AIMessage(content="final answer")])
    )
    _configure_llm(monkeypatch)

    wrapped = build_specialist_tool("ontology", "desc", "instructions", [])
    result = wrapped.invoke({"question": "q"})
    assert result == "final answer"


def test_build_specialist_tool_forwards_internal_tool_events_to_on_event(monkeypatch):
    import langchain.agents as langchain_agents
    from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

    messages = [
        HumanMessage(content="q"),
        AIMessage(content="", tool_calls=[{"name": "search_ontology", "args": {"term": "bond"}, "id": "call_1"}]),
        ToolMessage(content="found: Bond", name="search_ontology", tool_call_id="call_1"),
        AIMessage(content="A bond is a debt instrument."),
    ]
    monkeypatch.setattr(langchain_agents, "create_agent", lambda **kw: _FakeAgent(messages))
    _configure_llm(monkeypatch)

    events = []
    wrapped = build_specialist_tool("ontology", "desc", "instructions", [], on_event=events.append)
    result = wrapped.invoke({"question": "what is a bond?"})

    tool_calls = [e for e in events if e.kind == "tool_call"]
    tool_results = [e for e in events if e.kind == "tool_result"]
    assert len(tool_calls) == 1
    assert tool_calls[0].name == "search_ontology"
    assert len(tool_results) == 1
    assert tool_results[0].name == "search_ontology"
    assert "Bond" in tool_results[0].detail
    assert result == "A bond is a debt instrument."


def test_build_specialist_tool_does_not_forward_events_when_on_event_is_none(monkeypatch):
    import langchain.agents as langchain_agents
    from langchain_core.messages import AIMessage

    monkeypatch.setattr(langchain_agents, "create_agent", lambda **kw: _FakeAgent([AIMessage(content="ok")]))
    _configure_llm(monkeypatch)

    wrapped = build_specialist_tool("ontology", "desc", "instructions", [])
    # Must not raise even though on_event is None and the fake agent has no tool calls.
    assert wrapped.invoke({"question": "q"}) == "ok"


def test_build_specialist_tool_is_stateless_across_two_calls(monkeypatch):
    import langchain.agents as langchain_agents
    from langchain_core.messages import AIMessage

    captured_payloads = []

    def factory(**kwargs):
        class _Agent:
            def invoke(self, payload):
                captured_payloads.append(payload)
                question = payload["messages"][0].content
                return {"messages": [AIMessage(content=f"answer to {question}")]}

        return _Agent()

    monkeypatch.setattr(langchain_agents, "create_agent", factory)
    _configure_llm(monkeypatch)

    wrapped = build_specialist_tool("ontology", "desc", "instructions", [])
    result1 = wrapped.invoke({"question": "question one"})
    result2 = wrapped.invoke({"question": "question two"})

    assert result1 == "answer to question one"
    assert result2 == "answer to question two"
    assert len(captured_payloads) == 2
    assert captured_payloads[0]["messages"][0].content == "question one"
    assert captured_payloads[1]["messages"][0].content == "question two"


# ── load_specialists ───────────────────────────────────────────

ONTOLOGY_SKILL_MD = """---
name: ontology
description: FIBO ontology specialist.
---

You are a FIBO ontology expert.
"""

NOOP_TOOLS_PY = """
def build_tools():
    return []
"""


def write_specialist(root, folder="ontology", skill_md=ONTOLOGY_SKILL_MD, tools_py=NOOP_TOOLS_PY):
    specialist_dir = root / folder
    specialist_dir.mkdir(parents=True)
    (specialist_dir / "SKILL.md").write_text(skill_md, encoding="utf-8")
    (specialist_dir / "tools.py").write_text(tools_py, encoding="utf-8")
    return specialist_dir


def test_specialists_are_discovered_and_registered(tmp_path, monkeypatch):
    _configure_llm(monkeypatch)
    write_specialist(tmp_path)
    registry = CapabilityRegistry()
    loaded = load_specialists(registry, specialists_dir=str(tmp_path))
    assert loaded == ["ontology"]
    names = {t.name for t in registry.agent_tools()}
    assert "ask_ontology_specialist" in names


def test_specialist_tool_description_matches_skill_md_frontmatter(tmp_path):
    write_specialist(tmp_path)
    registry = CapabilityRegistry()
    load_specialists(registry, specialists_dir=str(tmp_path))
    tool = next(t for t in registry.agent_tools() if t.name == "ask_ontology_specialist")
    assert tool.description == "FIBO ontology specialist."


def test_specialist_registers_with_a_capability_named_after_it(tmp_path):
    write_specialist(tmp_path)
    registry = CapabilityRegistry()
    load_specialists(registry, specialists_dir=str(tmp_path))
    assert "AskOntologySpecialist" in registry.capabilities()


def test_broken_specialist_tools_py_is_skipped_not_fatal(tmp_path):
    good_skill_md = "---\nname: good\ndescription: a working specialist.\n---\n\ninstructions\n"
    write_specialist(tmp_path, folder="good", skill_md=good_skill_md)
    bad_skill_md = "---\nname: bad\ndescription: broken specialist.\n---\n\ninstructions\n"
    write_specialist(
        tmp_path,
        folder="bad",
        skill_md=bad_skill_md,
        tools_py="raise RuntimeError('backend not configured')\n",
    )
    registry = CapabilityRegistry()
    loaded = load_specialists(registry, specialists_dir=str(tmp_path))
    assert loaded == ["good"]


def test_missing_specialists_dir_is_a_noop(tmp_path):
    registry = CapabilityRegistry()
    assert load_specialists(registry, specialists_dir=str(tmp_path / "nope")) == []


def test_env_var_overrides_specialists_dir(tmp_path, monkeypatch):
    write_specialist(tmp_path)
    monkeypatch.setenv("POLANYI_SPECIALISTS_DIR", str(tmp_path))
    registry = CapabilityRegistry()
    assert load_specialists(registry) == ["ontology"]
