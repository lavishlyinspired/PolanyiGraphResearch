"""resolve_openai_kwargs is the provider-resolution knowledge shared by every
OpenAI-protocol consumer in this codebase (resolve_llm's ChatOpenAI, and
graphrag_pipeline's neo4j_graphrag OpenAILLM) — tested directly here rather
than only indirectly through resolve_llm, since it is the actual unit that
carries the branching logic."""

from __future__ import annotations

import pytest

from polanyi.kernel.llm import (
    annotate_opencode_model_pricing,
    build_llm_from_override,
    resolve_openai_kwargs,
)

_ALL_PROVIDER_ENV_VARS = [
    "POLANYI_LLM_PROVIDER",
    "NVIDIA_API_KEY",
    "OPENAI_API_KEY",
    "DATABRICKS_TOKEN",
    "DATABRICKS_SERVING_ENDPOINT",
    "DATABRICKS_HOST",
    "POLANYI_PIPELINE_MODEL",
    "POLANYI_AGENT_MODEL",
]


@pytest.fixture(autouse=True)
def _clean_provider_env(monkeypatch):
    for var in _ALL_PROVIDER_ENV_VARS:
        monkeypatch.delenv(var, raising=False)


def test_returns_none_when_no_provider_is_configured():
    assert resolve_openai_kwargs("pipeline") is None


def test_resolves_nvidia_kwargs_when_nvidia_key_is_set(monkeypatch):
    monkeypatch.setenv("NVIDIA_API_KEY", "nvidia-secret")

    kwargs = resolve_openai_kwargs("agent")

    assert kwargs == {
        "model": "nvidia/llama-3.3-nemotron-super-49b-v1.5",
        "api_key": "nvidia-secret",
        "base_url": "https://integrate.api.nvidia.com/v1",
    }


def test_resolves_openai_kwargs_when_openai_key_is_set(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "openai-secret")

    kwargs = resolve_openai_kwargs("pipeline")

    assert kwargs == {"model": "gpt-4o-mini"}


def test_resolves_databricks_kwargs_when_token_and_endpoint_are_set(monkeypatch):
    monkeypatch.setenv("DATABRICKS_TOKEN", "db-secret")
    monkeypatch.setenv("DATABRICKS_SERVING_ENDPOINT", "my-endpoint")
    monkeypatch.setenv("DATABRICKS_HOST", "https://my-workspace.cloud.databricks.com")

    kwargs = resolve_openai_kwargs("pipeline")

    assert kwargs == {
        "model": "my-endpoint",
        "api_key": "db-secret",
        "base_url": "https://my-workspace.cloud.databricks.com/serving-endpoints",
    }


def test_model_override_env_var_takes_precedence_over_provider_default(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "openai-secret")
    monkeypatch.setenv("POLANYI_PIPELINE_MODEL", "gpt-4o-custom")

    kwargs = resolve_openai_kwargs("pipeline")

    assert kwargs["model"] == "gpt-4o-custom"


# ── build_llm_from_override ──────────────────────────────────────
#
# Studio's provider switcher: the key lives in the browser and is supplied
# on this one request only -- these tests confirm the built client uses
# exactly what was passed in, never falling back to any server-side env
# var (a real cross-tenant leak risk if it ever did).


def test_build_llm_from_override_uses_the_explicit_model_and_key_not_env_vars(monkeypatch):
    monkeypatch.setenv("NVIDIA_API_KEY", "server-side-secret-must-not-be-used")
    monkeypatch.setenv("OPENAI_API_KEY", "also-must-not-be-used")

    llm = build_llm_from_override(model="deepseek-v4-flash", api_key="client-supplied-key")

    assert llm.model_name == "deepseek-v4-flash"
    assert llm.openai_api_key.get_secret_value() == "client-supplied-key"


def test_build_llm_from_override_sets_a_custom_base_url_when_provided():
    llm = build_llm_from_override(
        model="deepseek-v4-flash", api_key="k", base_url="https://opencode.ai/zen/v1"
    )
    assert llm.openai_api_base == "https://opencode.ai/zen/v1"


def test_build_llm_from_override_omits_base_url_when_not_provided():
    llm = build_llm_from_override(model="gpt-4o", api_key="k")
    assert llm.openai_api_base is None


# ── annotate_opencode_model_pricing ────────────────────────────────
#
# OpenCode Zen's real /v1/models response has no pricing field (verified
# directly against the live API), so free/paid is a maintained allowlist,
# not something derived from the API response itself. Pure and testable
# independent of the live HTTP call (list_provider_models, the thin
# wrapper that fetches the real catalog, is live-verified only).


def test_annotate_opencode_model_pricing_flags_a_dash_free_suffixed_model_as_free():
    result = annotate_opencode_model_pricing(["deepseek-v4-flash-free"])
    assert result == [{"id": "deepseek-v4-flash-free", "is_free": True}]


def test_annotate_opencode_model_pricing_flags_known_free_exceptions_without_the_suffix():
    result = annotate_opencode_model_pricing(["big-pickle", "gpt-5-nano"])
    assert result == [
        {"id": "big-pickle", "is_free": True},
        {"id": "gpt-5-nano", "is_free": True},
    ]


def test_annotate_opencode_model_pricing_flags_an_ordinary_model_as_not_free():
    result = annotate_opencode_model_pricing(["claude-opus-4-8"])
    assert result == [{"id": "claude-opus-4-8", "is_free": False}]


def test_annotate_opencode_model_pricing_preserves_input_order():
    result = annotate_opencode_model_pricing(["claude-opus-4-8", "big-pickle"])
    assert [r["id"] for r in result] == ["claude-opus-4-8", "big-pickle"]
