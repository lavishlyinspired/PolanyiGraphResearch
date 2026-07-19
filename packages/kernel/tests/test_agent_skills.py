"""S24: real progressive disclosure on the supervisor's own tool list --
LangChain's actual wrap_model_call/AgentMiddleware (verified directly
against the installed langchain package before writing this code, not
assumed from a doc summary), applied to on-demand procedural knowledge
(distinct from specialists.py's SKILL.md-as-system-prompt mechanism)."""

from __future__ import annotations

from polanyi.kernel.agent_skills import (
    build_load_skill_tool,
    build_skill_middleware,
    build_skills_addendum,
    load_agent_skills,
)

DISAMBIGUATION_SKILL_MD = """---
name: disambiguation
description: When to consult the ontology specialist, the graph specialist, or both.
---

Some questions need both specialists. Call the graph specialist first for
structural questions, the ontology specialist for FIBO classification.
"""


def write_agent_skill(root, folder="disambiguation", skill_md=DISAMBIGUATION_SKILL_MD):
    skill_dir = root / folder
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(skill_md, encoding="utf-8")
    return skill_dir


# ── load_agent_skills ────────────────────────────────────────────


def test_load_agent_skills_returns_the_real_skill_shape(tmp_path):
    write_agent_skill(tmp_path)
    skills = load_agent_skills(skills_dir=str(tmp_path))
    assert skills == [
        {
            "name": "disambiguation",
            "description": "When to consult the ontology specialist, the graph specialist, or both.",
            "content": (
                "Some questions need both specialists. Call the graph specialist first for\n"
                "structural questions, the ontology specialist for FIBO classification."
            ),
        }
    ]


def test_load_agent_skills_returns_empty_list_when_directory_is_missing(tmp_path):
    assert load_agent_skills(skills_dir=str(tmp_path / "nope")) == []


def test_load_agent_skills_returns_empty_list_when_directory_is_empty(tmp_path):
    assert load_agent_skills(skills_dir=str(tmp_path)) == []


def test_load_agent_skills_discovers_multiple_skills(tmp_path):
    write_agent_skill(tmp_path, folder="one", skill_md="---\nname: one\ndescription: first.\n---\n\nbody one\n")
    write_agent_skill(tmp_path, folder="two", skill_md="---\nname: two\ndescription: second.\n---\n\nbody two\n")
    skills = load_agent_skills(skills_dir=str(tmp_path))
    names = {s["name"] for s in skills}
    assert names == {"one", "two"}


def test_env_var_overrides_agent_skills_dir(tmp_path, monkeypatch):
    write_agent_skill(tmp_path)
    monkeypatch.setenv("POLANYI_AGENT_SKILLS_DIR", str(tmp_path))
    assert len(load_agent_skills()) == 1


# ── build_skills_addendum (pure) ─────────────────────────────────


def test_build_skills_addendum_lists_name_and_description_not_content():
    skills = [{"name": "disambiguation", "description": "When to use both specialists.", "content": "SECRET"}]
    addendum = build_skills_addendum(skills)
    assert "disambiguation" in addendum
    assert "When to use both specialists." in addendum
    assert "SECRET" not in addendum


def test_build_skills_addendum_instructs_loading_before_any_other_tool_call():
    """Live verification (S24) showed a soft, optional-sounding instruction
    ("use load_skill when you need...") was not enough to make the model
    proactively call it for a matching but ambiguously-phrased question.
    The addendum must instruct calling load_skill FIRST, before any other
    tool, whenever a skill's description matches the question's topic."""
    skills = [{"name": "disambiguation", "description": "desc", "content": "content"}]
    addendum = build_skills_addendum(skills)
    assert "load_skill" in addendum
    assert "before" in addendum.lower()
    assert "any other tool" in addendum.lower()


# ── build_load_skill_tool ─────────────────────────────────────────


def test_load_skill_tool_returns_the_full_content_by_name():
    skills = [{"name": "disambiguation", "description": "desc", "content": "full instructions here"}]
    tool = build_load_skill_tool(skills)
    result = tool.invoke({"skill_name": "disambiguation"})
    assert result == "full instructions here"


def test_load_skill_tool_reports_honestly_for_an_unknown_skill():
    skills = [{"name": "disambiguation", "description": "desc", "content": "content"}]
    tool = build_load_skill_tool(skills)
    result = tool.invoke({"skill_name": "nonexistent"})
    assert "not found" in result.lower()
    assert "disambiguation" in result


# ── build_skill_middleware ────────────────────────────────────────


def test_build_skill_middleware_returns_none_for_no_skills():
    assert build_skill_middleware([]) is None


def test_build_skill_middleware_injects_only_name_and_description_into_the_system_prompt():
    skills = [{"name": "disambiguation", "description": "When to use both specialists.", "content": "FULL SECRET CONTENT"}]
    middleware = build_skill_middleware(skills)
    assert middleware is not None

    class FakeRequest:
        def __init__(self, system_prompt):
            self.system_prompt = system_prompt

        def override(self, **kwargs):
            return FakeRequest(kwargs.get("system_prompt", self.system_prompt))

    captured = {}

    def fake_handler(request):
        captured["system_prompt"] = request.system_prompt
        return "handler-result"

    request = FakeRequest(system_prompt="Base prompt.")
    result = middleware.wrap_model_call(request, fake_handler)

    assert "Base prompt." in captured["system_prompt"]
    assert "disambiguation" in captured["system_prompt"]
    assert "When to use both specialists." in captured["system_prompt"]
    assert "FULL SECRET CONTENT" not in captured["system_prompt"]
    assert result == "handler-result"


def test_build_skill_middleware_registers_the_load_skill_tool():
    skills = [{"name": "disambiguation", "description": "desc", "content": "content"}]
    middleware = build_skill_middleware(skills)
    tool_names = {t.name for t in middleware.tools}
    assert "load_skill" in tool_names
