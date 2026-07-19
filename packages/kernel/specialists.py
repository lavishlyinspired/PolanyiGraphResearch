"""Specialist subagents: drop a folder into platform/specialists/ and
Polanyi Works discovers it -- the real agentskills.io SKILL.md format
applied to multi-tool specialist sub-agents, mirroring skills.py's
platform/skills/ discovery convention exactly (same importlib dynamic-
import technique, same per-item try/except resilience).

A specialist directory contains:
    SKILL.md   name + description frontmatter, markdown instructions body --
               becomes the specialist's own create_agent(...) system prompt
    tools.py   a build_tools() -> list[BaseTool] function -- the specialist's
               own bundled code, no dependency on capabilities.py

Each discovered specialist becomes ONE @tool (ask_<name>_specialist) -- a
stateless create_agent(...) worker (LangChain's documented Subagents
pattern: fresh context per call, checkpointer stays on the supervisor
only). Internal tool_call/tool_result events forward to on_event so
Studio's Agent Workspace trace stays granular -- a deliberate deviation
from the docs' own default (they rely on LangSmith tracing instead;
Polanyi doesn't use it).
"""

from __future__ import annotations

import importlib.util
import logging
import os
import re
from pathlib import Path
from typing import Any, Callable, Optional

from polanyi.kernel.capabilities import CapabilityProvider, CapabilityRegistry

logger = logging.getLogger(__name__)

DEFAULT_SPECIALISTS_DIR = "platform/specialists"

_FRONTMATTER = re.compile(r"^---\n(.*?)\n---\n(.*)$", re.DOTALL)


def parse_skill_md(text: str) -> tuple[str, str, str]:
    """(name, description, instructions) from a real SKILL.md file -- simple
    scalar frontmatter fields, the same shape as every skill this project's
    own CLAUDE.md already loads."""
    match = _FRONTMATTER.match(text)
    if not match:
        raise ValueError("SKILL.md must start with '---' frontmatter delimiters")
    frontmatter, body = match.groups()
    fields = dict(
        line.split(":", 1) for line in frontmatter.strip().splitlines() if ":" in line
    )
    for required in ("name", "description"):
        if required not in fields:
            raise ValueError(f"SKILL.md frontmatter missing required field: {required!r}")
    return fields["name"].strip(), fields["description"].strip(), body.strip()


def build_specialist_tool(
    name: str,
    description: str,
    instructions: str,
    tools: list,
    on_event: Optional[Callable[[Any], None]] = None,
) -> Any:
    """One @tool wrapping a stateless create_agent(...) worker. resolve_llm
    is checked per-call (not cached at build time) -- matches this
    codebase's established convention for "is X configured" checks."""
    from langchain.tools import tool as make_tool

    def ask(question: str) -> str:
        from polanyi.kernel.llm import resolve_llm

        # "agent" (stronger tier), not "pipeline" -- live-verified against the
        # real GraphDB: the "pipeline" tier (meta/llama-3.1-8b-instruct) failed
        # to sequence search_ontology -> expand_ontology correctly for "what
        # are the subclasses of Bond?" (returned "no subclasses found" despite
        # 43 real ones existing); the "agent" tier (nemotron-super-49b)
        # returned all 43 real subclasses correctly. Specialists need the same
        # multi-step tool-reasoning strength as the supervisor, not the
        # single-shot-friendly cheap tier.
        llm = resolve_llm("agent")
        if llm is None:
            return (
                f"The {name} specialist needs an LLM to answer, and none is "
                "configured. Set NVIDIA_API_KEY, OPENAI_API_KEY, or "
                "DATABRICKS_TOKEN + DATABRICKS_SERVING_ENDPOINT."
            )

        from langchain.agents import create_agent
        from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

        agent = create_agent(model=llm, tools=tools, system_prompt=instructions)
        result = agent.invoke({"messages": [HumanMessage(content=question)]})
        messages = result["messages"]
        if on_event is not None:
            from polanyi.models import AgentStep

            for message in messages:
                if isinstance(message, AIMessage):
                    for call in message.tool_calls or []:
                        on_event(
                            AgentStep(
                                kind="tool_call",
                                name=call["name"],
                                detail=str(call.get("args", {}))[:500],
                            )
                        )
                elif isinstance(message, ToolMessage):
                    on_event(
                        AgentStep(
                            kind="tool_result",
                            name=str(message.name or "tool"),
                            detail=str(message.content)[:500],
                        )
                    )
        return str(messages[-1].content) if messages else ""

    wrapped = make_tool(ask, description=description)
    wrapped.name = f"ask_{name}_specialist"
    return wrapped


def load_specialists(
    registry: CapabilityRegistry,
    on_event: Optional[Callable[[Any], None]] = None,
    specialists_dir: Optional[str] = None,
) -> list[str]:
    """Discover and register every valid specialist under `specialists_dir`.

    Returns the names of loaded specialists; a broken specialist is logged
    and skipped, not fatal to the rest of the registry build.
    """
    root = Path(
        specialists_dir or os.environ.get("POLANYI_SPECIALISTS_DIR", DEFAULT_SPECIALISTS_DIR)
    )
    if not root.is_dir():
        return []

    loaded: list[str] = []
    for skill_md_path in sorted(root.rglob("SKILL.md")):
        try:
            name = _load_one(registry, skill_md_path, on_event)
        except Exception as exc:  # noqa: BLE001 -- one broken specialist must not kill the rest
            logger.warning("Skipping specialist at %s: %s", skill_md_path.parent, exc)
            continue
        loaded.append(name)
    return loaded


def _load_one(
    registry: CapabilityRegistry,
    skill_md_path: Path,
    on_event: Optional[Callable[[Any], None]],
) -> str:
    name, description, instructions = parse_skill_md(
        skill_md_path.read_text(encoding="utf-8")
    )

    tools_file = skill_md_path.parent / "tools.py"
    module_name = f"polanyi_specialist_{name.replace('-', '_')}"
    spec = importlib.util.spec_from_file_location(module_name, tools_file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    tools = module.build_tools()

    wrapped = build_specialist_tool(name, description, instructions, tools, on_event)

    registry.register(
        CapabilityProvider(
            name=f"specialist-{name}",
            capability=f"Ask{name.title()}Specialist",
            kind="tool",
            description=description,
            handler=wrapped,
            metadata={"source": "specialist", "path": str(skill_md_path.parent)},
        )
    )
    return name
