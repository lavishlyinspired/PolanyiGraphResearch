"""Tests for platform/specialists/ontology/tools.py -- loaded the same way
packages.kernel.specialists.load_specialists() loads it (dynamic import via
importlib), since content under platform/ is never a conventional
importable package (mirrors the established platform/skills/ convention:
no test ever does `from platform.skills... import`, always goes through
the loader or, as here, the same dynamic-import technique directly)."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

_TOOLS_PATH = Path("platform/specialists/ontology/tools.py")


def _load_ontology_tools_module():
    spec = importlib.util.spec_from_file_location("test_ontology_specialist_tools_module", _TOOLS_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class _FakeStore:
    def __init__(self, search_result=None, expand_result=None, sparql_result=None):
        self._search_result = search_result if search_result is not None else []
        self._expand_result = expand_result if expand_result is not None else []
        self._sparql_result = sparql_result if sparql_result is not None else []

    def search_classes(self, term):
        return self._search_result

    def expand_subclasses(self, uri):
        return self._expand_result

    def sparql_query(self, query):
        return self._sparql_result


def _configure_fake_graphdb(monkeypatch, store=None):
    import polanyi.semantic.ontology as ontology_module

    monkeypatch.setattr(ontology_module, "graphdb_configured", lambda: True)
    monkeypatch.setattr(ontology_module, "GraphDBOntologyStore", lambda: store or _FakeStore())


def test_build_tools_raises_when_graphdb_not_configured(monkeypatch):
    import polanyi.semantic.ontology as ontology_module

    monkeypatch.setattr(ontology_module, "graphdb_configured", lambda: False)
    module = _load_ontology_tools_module()
    with pytest.raises(RuntimeError):
        module.build_tools()


def test_build_tools_returns_the_three_real_tools(monkeypatch):
    _configure_fake_graphdb(monkeypatch)
    module = _load_ontology_tools_module()
    names = {t.name for t in module.build_tools()}
    assert names == {"search_ontology", "expand_ontology", "query_ontology"}


def test_search_ontology_tool_delegates_to_the_real_store(monkeypatch):
    _configure_fake_graphdb(monkeypatch, _FakeStore(search_result=["fibo:Counterparty"]))
    module = _load_ontology_tools_module()
    tools = {t.name: t for t in module.build_tools()}
    result = tools["search_ontology"].invoke({"term": "Counterparty"})
    assert "fibo:Counterparty" in result


def test_expand_ontology_tool_delegates_to_the_real_store(monkeypatch):
    _configure_fake_graphdb(monkeypatch, _FakeStore(expand_result=["fibo:Bond", "fibo:MunicipalBond"]))
    module = _load_ontology_tools_module()
    tools = {t.name: t for t in module.build_tools()}
    result = tools["expand_ontology"].invoke({"uri": "https://fibo/Bond"})
    assert "fibo:Bond" in result
    assert "fibo:MunicipalBond" in result


def test_query_ontology_tool_rejects_write_sparql(monkeypatch):
    _configure_fake_graphdb(monkeypatch)
    module = _load_ontology_tools_module()
    tools = {t.name: t for t in module.build_tools()}
    result = tools["query_ontology"].invoke({"sparql": "INSERT DATA { <urn:x> <urn:y> <urn:z> }"})
    assert "BLOCKED" in result


def test_query_ontology_tool_calls_through_to_the_real_store(monkeypatch):
    _configure_fake_graphdb(monkeypatch, _FakeStore(sparql_result=[{"class": "fibo:Bond"}]))
    module = _load_ontology_tools_module()
    tools = {t.name: t for t in module.build_tools()}
    result = tools["query_ontology"].invoke({"sparql": "SELECT ?class WHERE { ?class a owl:Class }"})
    assert "fibo:Bond" in result


def test_query_ontology_tool_surfaces_store_errors_honestly(monkeypatch):
    class BoomStore(_FakeStore):
        def sparql_query(self, query):
            raise RuntimeError("connection reset")

    _configure_fake_graphdb(monkeypatch, BoomStore())
    module = _load_ontology_tools_module()
    tools = {t.name: t for t in module.build_tools()}
    result = tools["query_ontology"].invoke({"sparql": "SELECT ?class WHERE { ?class a owl:Class }"})
    assert "Error" in result
