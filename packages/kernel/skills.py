"""Skill plugins: drop a folder into platform/skills and Polanyi Works picks it up.

A skill is a directory containing:

    skill.yaml     name, capability, description, handler ("file.py:function"),
                   agent_tool (bool), metadata (dict)
    <handler file> a plain Python file exporting the handler function

Discovered skills register as capability providers; skills marked
`agent_tool: true` are wrapped as LangChain tools and become directly
callable by the grounded agent. Loading executes local code — treat the
skills directory with the same trust as installed packages.
"""

from __future__ import annotations

import importlib.util
import logging
import os
from pathlib import Path

from polanyi.kernel.capabilities import CapabilityProvider, CapabilityRegistry

logger = logging.getLogger(__name__)

DEFAULT_SKILLS_DIR = "platform/skills"


def load_skills(
    registry: CapabilityRegistry, skills_dir: str | None = None
) -> list[str]:
    """Discover and register every valid skill under `skills_dir`.

    Returns the names of loaded skills; broken skills are logged and skipped.
    """
    root = Path(skills_dir or os.environ.get("POLANYI_SKILLS_DIR", DEFAULT_SKILLS_DIR))
    if not root.is_dir():
        return []

    loaded: list[str] = []
    for manifest_path in sorted(root.rglob("skill.yaml")):
        try:
            name = _load_one(registry, manifest_path)
        except Exception as exc:  # noqa: BLE001 — one bad skill must not kill the rest
            logger.warning("Skipping skill at %s: %s", manifest_path.parent, exc)
            continue
        loaded.append(name)
    return loaded


def _load_one(registry: CapabilityRegistry, manifest_path: Path) -> str:
    import yaml

    manifest = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
    name = manifest["name"]
    capability = manifest["capability"]
    handler_ref = manifest["handler"]

    file_name, _, function_name = handler_ref.partition(":")
    handler_file = manifest_path.parent / file_name
    if not handler_file.exists():
        raise FileNotFoundError(f"handler file not found: {handler_file}")

    module_name = f"polanyi_skill_{name.replace('-', '_')}"
    spec = importlib.util.spec_from_file_location(module_name, handler_file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    handler = getattr(module, function_name)

    if manifest.get("agent_tool", False):
        from langchain.tools import tool as make_tool

        handler = make_tool(handler)
        kind = "tool"
    else:
        kind = "function"

    registry.register(
        CapabilityProvider(
            name=f"skill-{name}",
            capability=capability,
            kind=kind,
            description=manifest.get("description", ""),
            handler=handler,
            metadata={
                **(manifest.get("metadata") or {}),
                "source": "skill",
                "path": str(manifest_path.parent),
            },
        )
    )
    return name
