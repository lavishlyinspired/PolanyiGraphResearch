"""Supervisor-level Agent Skills: platform/agent-skills/*/SKILL.md content
folded into the supervisor's own system prompt.

Design history worth keeping in mind when touching this file: S24 first
built this as real on-demand progressive disclosure (LangChain's actual
wrap_model_call/AgentMiddleware, a load_skill tool the model calls when it
judges a skill relevant). Live verification against the exact question
that motivated the disambiguation skill showed the model would not
reliably call load_skill even after two rounds of strengthening the
addendum's wording (an imperative "call load_skill first" instruction,
then a concrete example-anchored skill description naming the trigger
pattern almost verbatim) -- confirmed via direct system-prompt inspection
that the stronger wording really was reaching the model. With only one
small skill today, eager inlining is simpler and empirically correct;
on-demand loading is worth revisiting only if skill count/size later makes
eager inclusion too costly for the supervisor's context budget."""

from __future__ import annotations

from polanyi.kernel.agent_skills import build_skills_addendum, load_agent_skills

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
#
# Eager inlining, not a teaser: the model must see the actual guidance
# unconditionally, since it demonstrably won't reliably ask for it itself.


def test_build_skills_addendum_returns_empty_string_for_no_skills():
    assert build_skills_addendum([]) == ""


def test_build_skills_addendum_includes_the_full_content_not_just_the_description():
    skills = [{"name": "disambiguation", "description": "short teaser.", "content": "THE FULL GUIDANCE BODY"}]
    addendum = build_skills_addendum(skills)
    assert "disambiguation" in addendum
    assert "THE FULL GUIDANCE BODY" in addendum


def test_build_skills_addendum_includes_every_skills_content_when_multiple_exist():
    skills = [
        {"name": "one", "description": "d1", "content": "CONTENT ONE"},
        {"name": "two", "description": "d2", "content": "CONTENT TWO"},
    ]
    addendum = build_skills_addendum(skills)
    assert "CONTENT ONE" in addendum
    assert "CONTENT TWO" in addendum
