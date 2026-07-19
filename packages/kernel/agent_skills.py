"""Content-only Agent Skills for the supervisor's own real progressive
disclosure -- LangChain's actual wrap_model_call/AgentMiddleware
(verified directly against the installed langchain package before this
was written, not assumed from a doc summary), loading procedural
knowledge on demand via a real load_skill tool call.

Distinct from specialists.py's folders (SKILL.md used directly as a
system prompt, no middleware, no on-demand loading, since a specialist
should have its full instructions from the start). This mechanism adds
knowledge to the SUPERVISOR's context, not new callable capability --
tools stay bound either way; only content is deferred."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Optional

from polanyi.kernel.specialists import parse_skill_md

DEFAULT_AGENT_SKILLS_DIR = "platform/agent-skills"


def load_agent_skills(skills_dir: Optional[str] = None) -> list[dict[str, str]]:
    """Every valid SKILL.md under `skills_dir`, in the exact
    {"name", "description", "content"} shape LangChain's real
    SkillMiddleware/load_skill tutorial code expects. Reuses
    specialists.py's parse_skill_md -- both mechanisms consume the
    identical real SKILL.md format."""
    root = Path(
        skills_dir or os.environ.get("POLANYI_AGENT_SKILLS_DIR", DEFAULT_AGENT_SKILLS_DIR)
    )
    if not root.is_dir():
        return []
    skills = []
    for skill_md_path in sorted(root.rglob("SKILL.md")):
        name, description, content = parse_skill_md(skill_md_path.read_text(encoding="utf-8"))
        skills.append({"name": name, "description": description, "content": content})
    return skills


def build_skills_addendum(skills: list[dict[str, str]]) -> str:
    """The system-prompt addendum listing only name+description, never full
    content -- the actual progressive-disclosure mechanism."""
    lines = "\n".join(f"- {s['name']}: {s['description']}" for s in skills)
    return (
        f"\n\n## Available Skills\n\n{lines}\n\n"
        "Before calling any other tool, check whether this question's topic "
        "matches one of the skills above. If it does, call load_skill with "
        "that skill's name first, before any other tool call, and follow its "
        "guidance."
    )


def build_load_skill_tool(skills: list[dict[str, str]]) -> Any:
    """The real load_skill tool -- returns a skill's full content by name,
    never fabricated for an unknown name."""
    from langchain.tools import tool as make_tool

    skills_by_name = {s["name"]: s for s in skills}

    @make_tool
    def load_skill(skill_name: str) -> str:
        """Load the full content of a skill into context by name."""
        skill = skills_by_name.get(skill_name)
        if skill is None:
            available = ", ".join(skills_by_name) or "none"
            return f"Skill '{skill_name}' not found. Available skills: {available}"
        return skill["content"]

    return load_skill


def build_skill_middleware(skills: list[dict[str, str]]) -> Optional[Any]:
    """None when there are no skills -- no pointless middleware wired in for
    nothing. Otherwise a real AgentMiddleware built from LangChain's actual
    wrap_model_call decorator."""
    if not skills:
        return None

    from langchain.agents.middleware import wrap_model_call

    load_skill = build_load_skill_tool(skills)
    addendum = build_skills_addendum(skills)

    @wrap_model_call(tools=[load_skill])
    def inject_skills(request, handler):
        request = request.override(system_prompt=(request.system_prompt or "") + addendum)
        return handler(request)

    return inject_skills
