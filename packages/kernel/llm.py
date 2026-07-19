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


def resolve_openai_kwargs(role: Role = "pipeline") -> Optional[dict]:
    """Provider-specific kwargs for constructing any OpenAI-protocol client —
    shared knowledge between resolve_llm's ChatOpenAI and other consumers
    (e.g. neo4j_graphrag's OpenAILLM) that also speak the OpenAI protocol
    but aren't LangChain chat models. Returns None when no provider is configured."""
    provider = detect_provider()
    if provider is None:
        return None

    model_override = os.environ.get(f"POLANYI_{role.upper()}_MODEL")

    if provider == "nvidia":
        return {
            "model": model_override or _NVIDIA_DEFAULTS[role],
            "api_key": os.environ["NVIDIA_API_KEY"],
            "base_url": _NVIDIA_BASE_URL,
        }
    if provider == "openai":
        return {"model": model_override or _OPENAI_DEFAULTS[role]}
    # databricks: model serving endpoints speak the OpenAI protocol
    host = os.environ.get("DATABRICKS_HOST", "").rstrip("/")
    endpoint = os.environ["DATABRICKS_SERVING_ENDPOINT"]
    return {
        "model": model_override or endpoint,
        "api_key": os.environ["DATABRICKS_TOKEN"],
        "base_url": f"{host}/serving-endpoints",
    }


def resolve_llm(role: Role = "pipeline", temperature: float = 0.0):
    """Return a ChatOpenAI bound to the detected provider, or None."""
    kwargs = resolve_openai_kwargs(role)
    if kwargs is None:
        return None

    from langchain_openai import ChatOpenAI

    return ChatOpenAI(**kwargs, temperature=temperature, timeout=120, max_retries=2)


def build_llm_from_override(
    model: str,
    api_key: str,
    base_url: Optional[str] = None,
    temperature: float = 0.0,
):
    """A ChatOpenAI built directly from explicit, caller-supplied
    credentials — never reads any environment variable. For Studio's
    provider switcher: the key lives in the browser and is supplied on
    this one request only, so it must never fall back to (or leak
    into) server-side provider configuration."""
    from langchain_openai import ChatOpenAI

    kwargs: dict = {"model": model, "api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url
    return ChatOpenAI(**kwargs, temperature=temperature, timeout=120, max_retries=2)


# ── Model catalogs (Studio's provider switcher) ────────────────────

_PROVIDER_BASE_URLS: dict[str, str] = {
    "nvidia": _NVIDIA_BASE_URL,
    "opencode": "https://opencode.ai/zen/v1",
}

# OpenCode Zen's real /v1/models response carries no pricing field
# (verified directly against the live API) -- this is a maintained
# allowlist, not something the API itself reports. Verified free as of
# 2026-07-20: every id ending in "-free", plus these two named exceptions.
_KNOWN_FREE_OPENCODE_MODELS = frozenset({"big-pickle", "gpt-5-nano"})


def annotate_opencode_model_pricing(model_ids: list[str]) -> list[dict]:
    """Real model ids in, each annotated with a maintained is_free flag."""
    return [
        {"id": model_id, "is_free": model_id.endswith("-free") or model_id in _KNOWN_FREE_OPENCODE_MODELS}
        for model_id in model_ids
    ]


def list_provider_models(provider: str, api_key: str) -> list[dict]:
    """The real, live model catalog from the provider's own /v1/models
    endpoint — never a hardcoded/fabricated list. Live-verified only,
    like this codebase's other thin provider-API wrappers."""
    import httpx

    base_url = _PROVIDER_BASE_URLS.get(provider)
    if base_url is None:
        raise ValueError(f"Unknown provider: {provider}")

    response = httpx.get(f"{base_url}/models", headers={"Authorization": f"Bearer {api_key}"}, timeout=10.0)
    response.raise_for_status()
    model_ids = [m["id"] for m in response.json()["data"]]

    if provider == "opencode":
        return annotate_opencode_model_pricing(model_ids)
    return [{"id": model_id, "is_free": None} for model_id in model_ids]
