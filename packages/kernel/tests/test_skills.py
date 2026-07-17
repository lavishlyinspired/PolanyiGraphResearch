import pytest

from polanyi.kernel.capabilities import CapabilityRegistry
from polanyi.kernel.skills import load_skills

FX_MANIFEST = """
name: fx-conversion
capability: ConvertCurrency
description: Convert monetary amounts between currencies
handler: handler.py:convert
agent_tool: true
metadata:
  provider: demo-rates
"""

FX_HANDLER = '''
def convert(amount: float, from_currency: str, to_currency: str) -> str:
    """Convert an amount between currencies."""
    return f"{amount} {from_currency} -> {to_currency}"
'''


def write_skill(root, folder="finance/fx-conversion", manifest=FX_MANIFEST, handler=FX_HANDLER):
    skill_dir = root / folder
    skill_dir.mkdir(parents=True)
    (skill_dir / "skill.yaml").write_text(manifest, encoding="utf-8")
    (skill_dir / "handler.py").write_text(handler, encoding="utf-8")
    return skill_dir


def test_skills_are_discovered_and_registered(tmp_path):
    write_skill(tmp_path)
    registry = CapabilityRegistry()
    loaded = load_skills(registry, skills_dir=str(tmp_path))
    assert loaded == ["fx-conversion"]
    provider = registry.resolve("ConvertCurrency")
    assert provider.name == "skill-fx-conversion"
    assert provider.metadata["source"] == "skill"
    assert provider.metadata["provider"] == "demo-rates"


def test_agent_tool_skills_become_langchain_tools(tmp_path):
    write_skill(tmp_path)
    registry = CapabilityRegistry()
    load_skills(registry, skills_dir=str(tmp_path))
    tools = registry.agent_tools()
    assert any(t.name == "convert" for t in tools)
    tool = next(t for t in tools if t.name == "convert")
    result = tool.invoke({"amount": 100.0, "from_currency": "USD", "to_currency": "EUR"})
    assert "100.0 USD -> EUR" in result


def test_non_tool_skills_register_as_functions(tmp_path):
    write_skill(tmp_path, manifest=FX_MANIFEST.replace("agent_tool: true", "agent_tool: false"))
    registry = CapabilityRegistry()
    load_skills(registry, skills_dir=str(tmp_path))
    provider = registry.resolve("ConvertCurrency")
    assert provider.kind == "function"
    assert provider.handler(1.0, "USD", "EUR") == "1.0 USD -> EUR"


def test_broken_manifests_are_skipped_not_fatal(tmp_path):
    write_skill(tmp_path, folder="good/skill-a")
    bad = tmp_path / "bad" / "skill-b"
    bad.mkdir(parents=True)
    (bad / "skill.yaml").write_text("name: broken\nhandler: missing.py:nope\n", encoding="utf-8")
    registry = CapabilityRegistry()
    loaded = load_skills(registry, skills_dir=str(tmp_path))
    assert loaded == ["fx-conversion"]


def test_missing_skills_dir_is_a_noop(tmp_path):
    registry = CapabilityRegistry()
    assert load_skills(registry, skills_dir=str(tmp_path / "nope")) == []


def test_env_var_overrides_skills_dir(tmp_path, monkeypatch):
    write_skill(tmp_path)
    monkeypatch.setenv("POLANYI_SKILLS_DIR", str(tmp_path))
    registry = CapabilityRegistry()
    assert load_skills(registry) == ["fx-conversion"]


def test_shipped_fx_skill_loads_from_platform_skills():
    registry = CapabilityRegistry()
    loaded = load_skills(registry, skills_dir="platform/skills")
    assert "fx-conversion" in loaded
    tool = registry.resolve("ConvertCurrency").handler
    result = tool.invoke({"amount": 92.0, "from_currency": "EUR", "to_currency": "USD"})
    assert "100.00 USD" in result


def test_default_registry_includes_plugged_skills(tmp_path):
    import pytest as _p

    from polanyi.demo import DEMO_BUSINESS_RULES, seed_demo_db
    from polanyi.kernel.capabilities import default_registry
    from polanyi.semantic.generate import build_rule_contexts

    db = tmp_path / "demo.db"
    seed_demo_db(str(db))
    registry = default_registry(f"sqlite:///{db}", build_rule_contexts(DEMO_BUSINESS_RULES))
    if "ConvertCurrency" not in registry.capabilities():
        _p.fail("default_registry must load platform/skills")
