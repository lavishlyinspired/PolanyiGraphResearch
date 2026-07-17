"""LLM provider resolution — any OpenAI-compatible endpoint, or none at all.

Polanyi Works is usable without an LLM (deterministic context, symbolic validation).
When a key is present, two roles are resolved:

- pipeline: fast model for structured context generation
- agent:    stronger tool-calling model for the SQL agent
"""

from __future__ import annotations

import os
from typing import Literal, Optional

Role = Literal["pipeline", "agent"]

_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
_NVIDIA_DEFAULTS: dict[Role, str] = {
    "pipeline": "meta/llama-3.1-8b-instruct",
    "agent": "nvidia/llama-3.3-nemotron-super-49b-v1.5",
}
_OPENAI_DEFAULTS: dict[Role, str] = {"pipeline": "gpt-4o-mini", "agent": "gpt-4o"}


def detect_provider() -> Optional[str]:
    forced = os.environ.get("POLANYI_LLM_PROVIDER", "").lower()
    if forced == "none":
        return None
    if forced in {"nvidia", "openai", "databricks"}:
        return forced
    if os.environ.get("NVIDIA_API_KEY"):
        return "nvidia"
    if os.environ.get("OPENAI_API_KEY"):
        return "openai"
    if os.environ.get("DATABRICKS_TOKEN") and os.environ.get("DATABRICKS_SERVING_ENDPOINT"):
        return "databricks"
    return None


def llm_mode() -> str:
    return "llm" if detect_provider() else "deterministic"


def resolve_llm(role: Role = "pipeline", temperature: float = 0.0):
    """Return a ChatOpenAI bound to the detected provider, or None."""
    provider = detect_provider()
    if provider is None:
        return None

    from langchain_openai import ChatOpenAI

    model_override = os.environ.get(f"POLANYI_{role.upper()}_MODEL")

    if provider == "nvidia":
        return ChatOpenAI(
            model=model_override or _NVIDIA_DEFAULTS[role],
            api_key=os.environ["NVIDIA_API_KEY"],
            base_url=_NVIDIA_BASE_URL,
            temperature=temperature,
            timeout=120,
            max_retries=2,
        )
    if provider == "openai":
        return ChatOpenAI(
            model=model_override or _OPENAI_DEFAULTS[role],
            temperature=temperature,
            timeout=120,
            max_retries=2,
        )
    # databricks: model serving endpoints speak the OpenAI protocol
    host = os.environ.get("DATABRICKS_HOST", "").rstrip("/")
    endpoint = os.environ["DATABRICKS_SERVING_ENDPOINT"]
    return ChatOpenAI(
        model=model_override or endpoint,
        api_key=os.environ["DATABRICKS_TOKEN"],
        base_url=f"{host}/serving-endpoints",
        temperature=temperature,
        timeout=120,
        max_retries=2,
    )
