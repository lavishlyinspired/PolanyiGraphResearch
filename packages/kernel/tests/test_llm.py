"""resolve_openai_kwargs is the provider-resolution knowledge shared by every
OpenAI-protocol consumer in this codebase (resolve_llm's ChatOpenAI, and
graphrag_pipeline's neo4j_graphrag OpenAILLM) — tested directly here rather
than only indirectly through resolve_llm, since it is the actual unit that
carries the branching logic."""

from __future__ import annotations

import pytest

from polanyi.kernel.llm import resolve_openai_kwargs

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
