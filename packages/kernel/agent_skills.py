"""Supervisor-level Agent Skills: platform/agent-skills/*/SKILL.md content
folded directly into the supervisor's own system prompt.

Distinct from specialists.py's folders (a specialist's SKILL.md is used
directly as its own system_prompt) only in *where* the content lands --
the supervisor's own prompt gets an addendum rather than a whole new
agent. Both mechanisms eagerly include full content; neither defers
loading behind a model-chosen tool call.

This was originally built as on-demand progressive disclosure (a real
load_skill tool, only name+description shown up front) via LangChain's
actual wrap_model_call/AgentMiddleware. Live verification against the
exact cross-specialist question that motivated the disambiguation skill
showed the model would not reliably call load_skill even after two
rounds of strengthening the wording -- confirmed via direct system-prompt
inspection that the stronger wording really was reaching the model. With
only one small skill today, eager inlining is simpler and empirically
correct; revisit on-demand loading only if skill count/size later makes
eager inclusion too costly for the supervisor's context budget."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from polanyi.kernel.specialists import parse_skill_md

DEFAULT_AGENT_SKILLS_DIR = "platform/agent-skills"


def load_agent_skills(skills_dir: Optional[str] = None) -> list[dict[str, str]]:
    """Every valid SKILL.md under `skills_dir`, as {"name", "description",
    "content"}. Reuses specialists.py's parse_skill_md -- both mechanisms
    consume the identical real SKILL.md format."""
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
    """The system-prompt addendum -- every skill's full content, always
    present. Empty string when there are no skills, so callers can
    unconditionally concatenate this onto the base system prompt."""
    if not skills:
        return ""
    sections = "\n\n".join(f"### {s['name']}\n\n{s['content']}" for s in skills)
    return f"\n\n## Additional Guidance\n\n{sections}\n"
