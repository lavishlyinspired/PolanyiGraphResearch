import json

import pytest
from fastapi.testclient import TestClient

from polanyi.api import create_app
from polanyi.demo import seed_demo_db


@pytest.fixture()
def client(tmp_path):
    db_path = tmp_path / "demo.db"
    seed_demo_db(str(db_path))
    app = create_app(db_uri=f"sqlite:///{db_path}", artifacts_dir=str(tmp_path))
    return TestClient(app)


def test_health_reports_mode(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["llm_mode"] in {"llm", "deterministic"}


def test_health_reports_graphdb_and_neo4j_unconfigured_by_default(client, monkeypatch):
    monkeypatch.delenv("GRAPHDB_ENDPOINT", raising=False)
    monkeypatch.delenv("NEO4J_URI", raising=False)
    res = client.get("/api/health")
    body = res.json()
    assert body["graphdb"] == {"configured": False, "available": False}
    assert body["neo4j"] == {"configured": False, "available": False}


def test_health_reports_graphdb_available_when_configured_and_reachable(client, monkeypatch):
    monkeypatch.setenv("GRAPHDB_ENDPOINT", "http://fake-graphdb:7200")

    class FakeStore:
        def is_available(self):
            return True

    import polanyi.semantic.ontology as ontology_module

    monkeypatch.setattr(ontology_module, "GraphDBOntologyStore", lambda: FakeStore())

    res = client.get("/api/health")
    assert res.json()["graphdb"] == {"configured": True, "available": True}


def test_health_reports_graphdb_unavailable_when_configured_but_unreachable(client, monkeypatch):
    monkeypatch.setenv("GRAPHDB_ENDPOINT", "http://fake-graphdb:7200")

    class UnreachableStore:
        def is_available(self):
            return False

    import polanyi.semantic.ontology as ontology_module

    monkeypatch.setattr(ontology_module, "GraphDBOntologyStore", lambda: UnreachableStore())

    res = client.get("/api/health")
    assert res.json()["graphdb"] == {"configured": True, "available": False}


def test_health_reports_neo4j_available_when_configured_and_reachable(client, monkeypatch):
    monkeypatch.setenv("NEO4J_URI", "neo4j://fake:7687")

    class FakeStore:
        def is_available(self):
            return True

        def close(self):
            pass

    import polanyi.execution.knowledge_graph as kg_module

    monkeypatch.setattr(kg_module, "Neo4jGraphStore", lambda **kwargs: FakeStore())

    res = client.get("/api/health")
    assert res.json()["neo4j"] == {"configured": True, "available": True}


def test_health_reports_neo4j_unavailable_when_construction_fails(client, monkeypatch):
    monkeypatch.setenv("NEO4J_URI", "neo4j://fake:7687")

    import polanyi.execution.knowledge_graph as kg_module

    def _boom(**kwargs):
        raise RuntimeError("cannot connect")

    monkeypatch.setattr(kg_module, "Neo4jGraphStore", _boom)

    res = client.get("/api/health")
    assert res.json()["neo4j"] == {"configured": True, "available": False}


def test_sources_lists_demo_database(client):
    res = client.get("/api/sources")
    assert res.status_code == 200
    sources = res.json()
    assert any(s["dialect"] == "sqlite" for s in sources)
    demo = next(s for s in sources if s["dialect"] == "sqlite")
    assert demo["table_count"] >= 7


def test_schema_returns_snapshot(client):
    res = client.get("/api/schema")
    assert res.status_code == 200
    names = {t["name"] for t in res.json()["tables"]}
    assert "trades" in names


def test_context_returns_semantic_context(client):
    res = client.get("/api/context")
    assert res.status_code == 200
    ctx = res.json()
    assert ctx["domain"]
    assert len(ctx["glossary"]) > 0
    assert len(ctx["relationships"]) > 0


def test_rules_endpoint_lists_business_rules(client):
    res = client.get("/api/rules")
    assert res.status_code == 200
    assert any(r["rule_id"] == "BR-001" for r in res.json())


def test_capabilities_endpoint_lists_providers(client):
    res = client.get("/api/capabilities")
    assert res.status_code == 200
    catalog = res.json()
    capabilities = {entry["capability"] for entry in catalog}
    assert {"DiscoverMetadata", "ExecuteSQL", "ValidateSQL"} <= capabilities
    assert all("handler" not in entry for entry in catalog)


def test_validate_endpoint_flags_bad_sql(client):
    res = client.post("/api/validate", json={"sql": "DROP TABLE trades"})
    assert res.status_code == 200
    assert res.json()["valid"] is False


def test_ask_without_llm_returns_503(client, monkeypatch):
    for var in ("NVIDIA_API_KEY", "OPENAI_API_KEY", "DATABRICKS_TOKEN"):
        monkeypatch.delenv(var, raising=False)
    res = client.post("/api/ask", json={"question": "How many trades?"})
    # In deterministic mode the agent cannot run — clients must get a clear signal
    assert res.status_code in {200, 503}


def test_sql_execute_runs_a_valid_query_and_returns_rows(client):
    res = client.post(
        "/api/sql/execute", json={"sql": "SELECT legal_name FROM counterparties LIMIT 3"}
    )
    assert res.status_code == 200
    body = res.json()
    assert body["validation"]["valid"] is True
    assert body["columns"] == ["legal_name"]
    assert len(body["rows"]) == 3


def test_sql_execute_does_not_run_a_blocked_query(client):
    res = client.post(
        "/api/sql/execute",
        json={
            "sql": (
                "SELECT t.trade_id, c.legal_name FROM trades t "
                "JOIN counterparties c ON t.counterparty_id = c.counterparty_id"
            )
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["validation"]["valid"] is False
    assert body["rows"] == []


def test_graph_query_rejects_write_cypher_with_400(client):
    res = client.post("/api/graph/query", json={"query": "CREATE (n:Rogue) RETURN n"})
    assert res.status_code == 400
    assert "read-only" in res.json()["detail"].lower()


def test_graph_query_returns_rows_from_a_read_query(client, monkeypatch):
    class FakeStore:
        def is_available(self):
            return True

        def run_cypher(self, query):
            assert query == "MATCH (n) RETURN n LIMIT 1"
            return [{"n": {"name": "demo"}}]

        def close(self):
            pass

    monkeypatch.setenv("NEO4J_URI", "neo4j://fake:7687")
    import polanyi.execution.knowledge_graph as kg_module

    monkeypatch.setattr(kg_module, "Neo4jGraphStore", lambda: FakeStore())

    res = client.post("/api/graph/query", json={"query": "MATCH (n) RETURN n LIMIT 1"})
    assert res.status_code == 200
    assert res.json()["rows"] == [{"n": {"name": "demo"}}]


def test_graph_stats_returns_real_node_and_edge_counts(client, monkeypatch):
    class FakeStore:
        def is_available(self):
            return True

        def run_cypher(self, query):
            if "count(n)" in query:
                return [{"nodes": 148}]
            return [{"edges": 212}]

        def close(self):
            pass

    monkeypatch.setenv("NEO4J_URI", "neo4j://fake:7687")
    import polanyi.execution.knowledge_graph as kg_module

    monkeypatch.setattr(kg_module, "Neo4jGraphStore", lambda **kwargs: FakeStore())

    res = client.get("/api/graph/stats")
    assert res.status_code == 200
    assert res.json() == {"nodes": 148, "edges": 212}


def test_graph_stats_returns_503_when_neo4j_unconfigured(client, monkeypatch):
    monkeypatch.delenv("NEO4J_URI", raising=False)
    res = client.get("/api/graph/stats")
    assert res.status_code == 503


def test_graph_stats_returns_503_when_neo4j_unreachable(client, monkeypatch):
    class UnreachableStore:
        def is_available(self):
            return False

        def close(self):
            pass

    monkeypatch.setenv("NEO4J_URI", "neo4j://fake:7687")
    import polanyi.execution.knowledge_graph as kg_module

    monkeypatch.setattr(kg_module, "Neo4jGraphStore", lambda **kwargs: UnreachableStore())

    res = client.get("/api/graph/stats")
    assert res.status_code == 503


def test_sparql_uses_graphdb_when_configured_and_available(client, monkeypatch):
    monkeypatch.setenv("GRAPHDB_ENDPOINT", "http://fake-graphdb:7200")

    class FakeStore:
        def is_available(self):
            return True

        def sparql_query(self, query):
            assert "prefLabel" in query
            return [{"term": "Counterparty"}]

    import polanyi.semantic.ontology as ontology_module

    monkeypatch.setattr(ontology_module, "GraphDBOntologyStore", lambda: FakeStore())

    res = client.post("/api/sparql", json={"query": "SELECT ?term WHERE { ?t skos:prefLabel ?term }"})
    assert res.status_code == 200
    body = res.json()
    assert body["engine"] == "graphdb"
    assert body["rows"] == [{"term": "Counterparty"}]


def test_sparql_falls_back_to_local_context_when_graphdb_unconfigured(client, monkeypatch):
    monkeypatch.delenv("GRAPHDB_ENDPOINT", raising=False)

    res = client.post(
        "/api/sparql",
        json={
            "query": (
                "PREFIX skos: <http://www.w3.org/2004/02/skos/core#> "
                "SELECT ?term WHERE { ?t skos:prefLabel ?term }"
            )
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["engine"] == "local"
    assert isinstance(body["rows"], list)


def test_alignment_queue_buckets_glossary_terms_by_confidence(client, monkeypatch):
    monkeypatch.setenv("GRAPHDB_ENDPOINT", "http://fake-graphdb:7200")
    from polanyi.semantic.ontology import OntologyCandidate

    class FakeStore:
        def is_available(self):
            return True

        def search_classes(self, term, limit=5):
            # "Account …" terms exist in the demo glossary → auto-align them; the
            # rest have no candidate → unmapped. Guarantees a mix of both bands.
            if term.lower().startswith("account"):
                return [OntologyCandidate(uri="urn:fibo:Account", label="Account", score=0.97)]
            return []

    import polanyi.semantic.ontology as ontology_module

    monkeypatch.setattr(ontology_module, "GraphDBOntologyStore", lambda: FakeStore())

    res = client.get("/api/context/align/queue")
    assert res.status_code == 200
    body = res.json()
    bands = {item["term"]: item["band"] for item in body["items"]}
    # Every glossary term is reported exactly once.
    assert len(body["items"]) == len(bands)
    # A high-score candidate lands in 'auto'; a term with none lands in 'unmapped'.
    assert "auto" in bands.values()
    assert "unmapped" in bands.values()


def test_alignment_queue_returns_503_when_graphdb_unconfigured(client, monkeypatch):
    monkeypatch.delenv("GRAPHDB_ENDPOINT", raising=False)
    res = client.get("/api/context/align/queue")
    assert res.status_code == 503


def test_alignment_queue_returns_503_when_graphdb_configured_but_unreachable(client, monkeypatch):
    monkeypatch.setenv("GRAPHDB_ENDPOINT", "http://fake-graphdb:7200")

    class UnreachableStore:
        def is_available(self):
            return False

        def search_classes(self, term, limit=5):  # pragma: no cover - must never be called
            raise AssertionError("search_classes must not run when the store is unreachable")

    import polanyi.semantic.ontology as ontology_module

    monkeypatch.setattr(ontology_module, "GraphDBOntologyStore", lambda: UnreachableStore())

    res = client.get("/api/context/align/queue")
    assert res.status_code == 503


def _fake_account_store(monkeypatch):
    from polanyi.semantic.ontology import OntologyCandidate

    class FakeStore:
        def is_available(self):
            return True

        def search_classes(self, term, limit=5):
            if term.lower().startswith("account name"):
                return [OntologyCandidate(uri="urn:fibo:Account", label="Account", score=0.61)]
            return []

    import polanyi.semantic.ontology as ontology_module

    monkeypatch.setattr(ontology_module, "GraphDBOntologyStore", lambda: FakeStore())


def test_accept_moves_a_term_from_review_into_the_aligned_band(client, monkeypatch):
    monkeypatch.setenv("GRAPHDB_ENDPOINT", "http://fake-graphdb:7200")
    _fake_account_store(monkeypatch)

    # Before: a 0.61 candidate puts "Account Name" in the review band.
    before = {i["term"]: i["band"] for i in client.get("/api/context/align/queue").json()["items"]}
    assert before["Account Name"] == "review"

    res = client.post("/api/context/align/Account Name/accept")
    assert res.status_code == 200

    # After: the accepted term is now aligned, and it stays that way on reload.
    after = {i["term"]: i["band"] for i in client.get("/api/context/align/queue").json()["items"]}
    assert after["Account Name"] == "auto"


def test_accept_returns_404_for_an_unknown_term(client, monkeypatch):
    monkeypatch.setenv("GRAPHDB_ENDPOINT", "http://fake-graphdb:7200")
    _fake_account_store(monkeypatch)

    res = client.post("/api/context/align/No Such Term/accept")
    assert res.status_code == 404


def test_accept_returns_503_when_graphdb_unconfigured(client, monkeypatch):
    monkeypatch.delenv("GRAPHDB_ENDPOINT", raising=False)
    res = client.post("/api/context/align/Account Name/accept")
    assert res.status_code == 503


def test_reject_moves_a_term_from_review_into_the_rejected_band(client, monkeypatch):
    monkeypatch.setenv("GRAPHDB_ENDPOINT", "http://fake-graphdb:7200")
    _fake_account_store(monkeypatch)

    before = {i["term"]: i["band"] for i in client.get("/api/context/align/queue").json()["items"]}
    assert before["Account Name"] == "review"

    res = client.post("/api/context/align/Account Name/reject")
    assert res.status_code == 200

    after = {i["term"]: i["band"] for i in client.get("/api/context/align/queue").json()["items"]}
    assert after["Account Name"] == "rejected"


def test_reject_returns_404_for_an_unknown_term(client, monkeypatch):
    monkeypatch.setenv("GRAPHDB_ENDPOINT", "http://fake-graphdb:7200")
    _fake_account_store(monkeypatch)

    res = client.post("/api/context/align/No Such Term/reject")
    assert res.status_code == 404


def _fake_ambiguous_store(monkeypatch):
    """Two real candidates for 'Account Name' — one plainly not the top lexical
    score — so an LLM pick is distinguishable from the raw-best fallback."""
    from polanyi.semantic.ontology import OntologyCandidate

    class FakeStore:
        def is_available(self):
            return True

        def search_classes(self, term, limit=5):
            if term.lower().startswith("account name"):
                return [
                    OntologyCandidate(uri="urn:fibo:AccountLabel", label="Account Label", score=0.7),
                    OntologyCandidate(uri="urn:fibo:AccountRef", label="Account Reference", score=0.55),
                ]
            return []

        def class_hierarchy(self, class_uri):
            return [], []

    import polanyi.semantic.ontology as ontology_module

    monkeypatch.setattr(ontology_module, "GraphDBOntologyStore", lambda: FakeStore())


class _FakeRankingLLM:
    def __init__(self, chosen_uri):
        self.chosen_uri = chosen_uri

    def with_structured_output(self, schema):
        outer = self

        class Runner:
            def invoke(self, _prompt):
                return schema(chosen_uri=outer.chosen_uri)

        return Runner()


def test_queue_endpoint_wires_resolve_llm_into_the_review_band(client, monkeypatch):
    """Proves the API layer actually passes resolve_llm() through to
    alignment_queue() — not just that alignment_queue() honors an llm param when
    called directly (already covered at the unit level in test_ontology.py)."""
    monkeypatch.setenv("GRAPHDB_ENDPOINT", "http://fake-graphdb:7200")
    _fake_ambiguous_store(monkeypatch)

    import polanyi.api as api_module

    monkeypatch.setattr(api_module, "resolve_llm", lambda role: _FakeRankingLLM("urn:fibo:AccountRef"))

    res = client.get("/api/context/align/queue")
    assert res.status_code == 200
    item = next(i for i in res.json()["items"] if i["term"] == "Account Name")
    assert item["band"] == "review"
    assert item["candidate_uri"] == "urn:fibo:AccountRef"  # LLM's pick, not the 0.7 top score


def test_accept_endpoint_wires_resolve_llm_and_persists_the_same_candidate_shown(client, monkeypatch):
    monkeypatch.setenv("GRAPHDB_ENDPOINT", "http://fake-graphdb:7200")
    _fake_ambiguous_store(monkeypatch)

    import polanyi.api as api_module

    monkeypatch.setattr(api_module, "resolve_llm", lambda role: _FakeRankingLLM("urn:fibo:AccountRef"))

    res = client.post("/api/context/align/Account Name/accept")
    assert res.status_code == 200
    item = next(i for i in res.json()["items"] if i["term"] == "Account Name")
    assert item["band"] == "auto"
    assert item["candidate_uri"] == "urn:fibo:AccountRef"


def test_accepted_alignment_survives_a_context_regenerate(client, monkeypatch):
    """Regenerating context (e.g. after re-introspecting) must not wipe a
    steward's already-accepted FIBO alignment for a term that still exists."""
    monkeypatch.setenv("GRAPHDB_ENDPOINT", "http://fake-graphdb:7200")
    _fake_account_store(monkeypatch)

    accept_res = client.post("/api/context/align/Account Name/accept")
    assert accept_res.status_code == 200

    regen_res = client.post("/api/context/generate", json={"use_llm": False})
    assert regen_res.status_code == 200
    regenerated = next(
        g for g in regen_res.json()["glossary"] if g["term"] == "Account Name"
    )
    assert regenerated["ontology_uri"] == "urn:fibo:Account"

    after = {i["term"]: i["band"] for i in client.get("/api/context/align/queue").json()["items"]}
    assert after["Account Name"] == "auto"


# ── Databricks integration ────────────────────────────────────────────


def _make_fake_databricks_client(monkeypatch):
    """Create a FakeDatabricksClient and patch it into the api module."""

    class FakeClient:
        def __init__(self, **_kwargs):
            pass

        def list_catalogs(self):
            return ["workspace", "graphos", "system"]

        def list_schemas(self, catalog="graphos"):
            return ["default", "raw", "curated"]

        def list_tables(self, catalog="graphos", schema="default"):
            # Mirrors the Unity Catalog REST shape (tables.list already includes
            # column and PK/FK constraint metadata — no SQL warehouse round trip
            # required).
            return [
                {
                    "name": "trades",
                    "table_type": "MANAGED",
                    "data_source_format": "DELTA",
                    "comment": "Trade records",
                    "foreign_keys": [
                        {
                            "column": "counterparty_id",
                            "references_table": "counterparties",
                            "references_column": "counterparty_id",
                        }
                    ],
                    "columns": [
                        {"name": "trade_id", "type": "bigint", "nullable": False, "primary_key": True},
                        {"name": "counterparty_id", "type": "bigint", "nullable": False, "primary_key": False},
                        {"name": "notional_amount", "type": "decimal(18,2)", "nullable": False, "primary_key": False},
                        {"name": "trade_date", "type": "date", "nullable": False, "primary_key": False},
                    ],
                },
                {
                    "name": "counterparties",
                    "table_type": "MANAGED",
                    "data_source_format": "DELTA",
                    "comment": "Legal entities",
                    "foreign_keys": [],
                    "columns": [
                        {"name": "counterparty_id", "type": "bigint", "nullable": False, "primary_key": True},
                        {"name": "legal_name", "type": "string", "nullable": False, "primary_key": False},
                    ],
                },
            ]

        def close(self):
            pass

    import polanyi.api as api_module

    monkeypatch.setattr(api_module, "_get_databricks_client", lambda: FakeClient())
    return FakeClient


def test_databricks_status_connected(client, monkeypatch):
    monkeypatch.setenv("DATABRICKS_HOST", "https://test.cloud.databricks.com")
    monkeypatch.setenv("DATABRICKS_TOKEN", "fake-token")
    _make_fake_databricks_client(monkeypatch)

    res = client.get("/api/databricks/status")
    assert res.status_code == 200
    body = res.json()
    assert body["connected"] is True
    assert body["catalogs"] == ["workspace", "graphos", "system"]
    assert body["error"] is None


def test_databricks_status_error_when_connection_fails(client, monkeypatch):
    monkeypatch.setenv("DATABRICKS_HOST", "https://test.cloud.databricks.com")
    monkeypatch.setenv("DATABRICKS_TOKEN", "fake-token")

    def _fail_client():
        raise ConnectionError("Cannot reach Databricks")

    import polanyi.api as api_module

    monkeypatch.setattr(api_module, "_get_databricks_client", _fail_client)

    res = client.get("/api/databricks/status")
    assert res.status_code == 200
    body = res.json()
    assert body["connected"] is False
    assert body["catalogs"] == []
    assert "Cannot reach Databricks" in body["error"]


def test_databricks_schemas_returns_schemas_for_catalog(client, monkeypatch):
    monkeypatch.setenv("DATABRICKS_HOST", "https://test.cloud.databricks.com")
    monkeypatch.setenv("DATABRICKS_TOKEN", "fake-token")
    _make_fake_databricks_client(monkeypatch)

    res = client.get("/api/databricks/schemas", params={"catalog": "graphos"})
    assert res.status_code == 200
    body = res.json()
    assert body["schemas"] == ["default", "raw", "curated"]


def test_sources_includes_databricks_with_real_catalog_count(client, monkeypatch):
    monkeypatch.setenv("DATABRICKS_HOST", "https://test.cloud.databricks.com")
    monkeypatch.setenv("DATABRICKS_TOKEN", "fake-token")
    _make_fake_databricks_client(monkeypatch)

    res = client.get("/api/sources")
    assert res.status_code == 200
    sources = res.json()
    databricks = next(s for s in sources if s["dialect"] == "databricks")
    assert databricks["status"] == "connected"
    assert databricks["objects_label"] == "3 catalogs"
    assert "test.cloud.databricks.com" in databricks["uri"]


def test_schema_databricks_returns_real_introspected_tables(client, monkeypatch):
    monkeypatch.setenv("DATABRICKS_HOST", "https://test.cloud.databricks.com")
    monkeypatch.setenv("DATABRICKS_TOKEN", "fake-token")
    _make_fake_databricks_client(monkeypatch)

    res = client.get(
        "/api/schema",
        params={"source": "databricks", "catalog": "graphos", "schema_name": "default"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["dialect"] == "databricks"
    table_names = {t["name"] for t in body["tables"]}
    assert "trades" in table_names
    assert "counterparties" in table_names
    trades = next(t for t in body["tables"] if t["name"] == "trades")
    col_names = {c["name"] for c in trades["columns"]}
    assert "trade_id" in col_names
    assert "notional_amount" in col_names
    trade_id = next(c for c in trades["columns"] if c["name"] == "trade_id")
    assert trade_id["primary_key"] is True
    assert trades["foreign_keys"] == [
        {
            "column": "counterparty_id",
            "references_table": "counterparties",
            "references_column": "counterparty_id",
        }
    ]


def test_schema_databricks_error_when_not_connected(client, monkeypatch):
    monkeypatch.delenv("DATABRICKS_HOST", raising=False)
    monkeypatch.delenv("DATABRICKS_TOKEN", raising=False)

    res = client.get(
        "/api/schema",
        params={"source": "databricks", "catalog": "graphos", "schema_name": "default"},
    )
    assert res.status_code == 503
    assert "Databricks" in res.json()["detail"]


# ── Source persistence: connect / disconnect / (re-)introspect ────────


def test_sources_primary_entry_is_marked_non_removable_with_a_real_timestamp(client):
    res = client.get("/api/sources")
    demo = next(s for s in res.json() if s["dialect"] == "sqlite")
    assert demo["is_primary"] is True
    assert demo["removable"] is False
    assert demo["last_introspected"] == "just now"


def test_connect_source_persists_across_a_fresh_app_instance(tmp_path):
    db_path = tmp_path / "demo.db"
    seed_demo_db(str(db_path))
    app = create_app(db_uri=f"sqlite:///{db_path}", artifacts_dir=str(tmp_path))
    first_client = TestClient(app)

    res = first_client.post(
        "/api/sources",
        json={"name": "reporting-db", "uri": f"sqlite:///{tmp_path}/other.db", "kind": "sqlite"},
    )
    assert res.status_code == 200
    connected = next(s for s in res.json() if s["name"] == "reporting-db")
    assert connected["status"] == "configured"
    assert connected["removable"] is True

    # Simulate a server restart / page refresh: a brand new app instance
    # reading the same artifacts_dir should still see the connection.
    restarted_app = create_app(db_uri=f"sqlite:///{db_path}", artifacts_dir=str(tmp_path))
    restarted_client = TestClient(restarted_app)
    res = restarted_client.get("/api/sources")
    assert any(s["name"] == "reporting-db" for s in res.json())


def test_connect_source_rejects_a_duplicate_name(client):
    client.post(
        "/api/sources",
        json={"name": "reporting-db", "uri": "sqlite:///other.db", "kind": "sqlite"},
    )
    res = client.post(
        "/api/sources",
        json={"name": "reporting-db", "uri": "sqlite:///another.db", "kind": "sqlite"},
    )
    assert res.status_code == 409


def test_disconnect_source_removes_it_and_persists_the_removal(client, tmp_path):
    client.post(
        "/api/sources",
        json={"name": "reporting-db", "uri": "sqlite:///other.db", "kind": "sqlite"},
    )
    res = client.delete("/api/sources/reporting-db")
    assert res.status_code == 200
    assert all(s["name"] != "reporting-db" for s in res.json())

    sources_file = tmp_path / "sources.json"
    assert json.loads(sources_file.read_text())["extra"] == []


def test_disconnect_unknown_source_returns_404(client):
    res = client.delete("/api/sources/does-not-exist")
    assert res.status_code == 404


def test_introspect_extra_source_returns_real_schema(client, tmp_path):
    import sqlite3

    other_db = tmp_path / "other.db"
    conn = sqlite3.connect(str(other_db))
    conn.execute("CREATE TABLE widgets (widget_id INTEGER PRIMARY KEY, label TEXT)")
    conn.commit()
    conn.close()

    client.post(
        "/api/sources",
        json={"name": "reporting-db", "uri": f"sqlite:///{other_db}", "kind": "sqlite"},
    )
    res = client.post("/api/sources/reporting-db/introspect")
    assert res.status_code == 200
    connected = next(s for s in res.json() if s["name"] == "reporting-db")
    assert connected["status"] == "connected"
    assert connected["table_count"] == 1

    schema_res = client.get("/api/schema", params={"name": "reporting-db"})
    assert schema_res.status_code == 200
    table_names = {t["name"] for t in schema_res.json()["tables"]}
    assert table_names == {"widgets"}


def test_introspect_unknown_source_returns_404(client):
    res = client.post("/api/sources/does-not-exist/introspect")
    assert res.status_code == 404


def test_schema_unknown_extra_source_name_returns_404(client):
    res = client.get("/api/schema", params={"name": "does-not-exist"})
    assert res.status_code == 404


# ── Databricks connect: separate fields, not a raw URI ─────────────────


def test_connect_databricks_source_builds_uri_from_separate_fields(client, tmp_path):
    res = client.post(
        "/api/sources",
        json={
            "name": "dbc",
            "kind": "databricks",
            "host": "https://dbc-a541b96d-b43f.cloud.databricks.com",
            "warehouse_id": "a1b2c3d4e5f6",
            "token": "dapi1234567890",
        },
    )
    assert res.status_code == 200
    connected = next(s for s in res.json() if s["name"] == "dbc")
    assert connected["dialect"] == "databricks"
    assert connected["status"] == "configured"
    # The token must never round-trip in the API response.
    assert "dapi1234567890" not in connected["uri"]

    persisted = json.loads((tmp_path / "sources.json").read_text())
    dbc_entry = next(s for s in persisted["extra"] if s["name"] == "dbc")
    assert dbc_entry["uri"] == (
        "databricks://token:dapi1234567890@dbc-a541b96d-b43f.cloud.databricks.com"
        "/sql/1.0/warehouses/a1b2c3d4e5f6"
    )


def test_connect_databricks_source_missing_fields_returns_400(client):
    res = client.post(
        "/api/sources",
        json={"name": "dbc", "kind": "databricks", "host": "some-host.cloud.databricks.com"},
    )
    assert res.status_code == 400
    detail = res.json()["detail"]
    assert "warehouse ID" in detail
    assert "access token" in detail


def test_introspect_reports_a_friendly_error_for_an_unrecognized_uri_scheme(client):
    client.post(
        "/api/sources",
        json={"name": "bad-source", "uri": "https://example.com", "kind": "sqlite"},
    )
    res = client.post("/api/sources/bad-source/introspect")
    assert res.status_code == 502
    detail = res.json()["detail"]
    assert "Can't load plugin" not in detail
    assert "sqlalchemy.dialects" not in detail
    assert "sqlite://" in detail and "databricks://" in detail


def test_friendly_introspect_error_strips_sqlalchemy_wrapper_noise():
    from polanyi.api import _friendly_introspect_error

    exc = Exception(
        "(databricks.sql.exc.RequestError) Error during request to server: : "
        "Credential was not sent or was of an unsupported type for this API.. \n"
        "(Background on this error at: https://sqlalche.me/e/20/e3q8)"
    )
    message = _friendly_introspect_error(exc)
    assert "sqlalche.me" not in message
    assert "databricks.sql.exc.RequestError" not in message
    assert "Authentication failed" in message


# ── Editing existing connections ───────────────────────────────────────


def test_edit_primary_source_swaps_the_database_and_regenerates_context(client, tmp_path):
    import sqlite3

    other_db = tmp_path / "swapped.db"
    conn = sqlite3.connect(str(other_db))
    conn.execute("CREATE TABLE widgets (widget_id INTEGER PRIMARY KEY, label TEXT NOT NULL)")
    conn.commit()
    conn.close()

    demo_sources = client.get("/api/sources").json()
    primary_name = next(s["name"] for s in demo_sources if s["is_primary"])

    res = client.patch(f"/api/sources/{primary_name}", json={"uri": f"sqlite:///{other_db}"})
    assert res.status_code == 200
    updated = next(s for s in res.json() if s["is_primary"])
    assert updated["name"] == "swapped.db"
    assert updated["table_count"] == 1

    schema_res = client.get("/api/schema")
    assert {t["name"] for t in schema_res.json()["tables"]} == {"widgets"}

    ctx_res = client.get("/api/context")
    assert any("Label" in g["term"] for g in ctx_res.json()["glossary"])


def test_edit_primary_source_rejects_an_empty_uri(client):
    demo_sources = client.get("/api/sources").json()
    primary_name = next(s["name"] for s in demo_sources if s["is_primary"])

    res = client.patch(f"/api/sources/{primary_name}", json={"uri": ""})
    assert res.status_code == 400


def test_edit_primary_source_rolls_back_on_a_bad_uri(client):
    demo_sources = client.get("/api/sources").json()
    primary_name = next(s["name"] for s in demo_sources if s["is_primary"])

    res = client.patch(f"/api/sources/{primary_name}", json={"uri": "not-a-real-uri"})
    assert res.status_code == 502

    # The original database must still be in effect after a failed edit.
    res = client.get("/api/sources")
    assert res.status_code == 200
    assert res.json()[0]["name"] == primary_name


def test_edit_databricks_env_source_persists_catalog_and_schema(client, monkeypatch, tmp_path):
    monkeypatch.setenv("DATABRICKS_HOST", "https://test.cloud.databricks.com")
    monkeypatch.setenv("DATABRICKS_TOKEN", "fake-token")
    _make_fake_databricks_client(monkeypatch)

    res = client.patch(
        "/api/sources/test", json={"catalog": "graphos", "schema_name": "default"}
    )
    assert res.status_code == 200
    updated = next(s for s in res.json() if s["dialect"] == "databricks")
    assert updated["catalog"] == "graphos"
    assert updated["schema_name"] == "default"

    persisted = json.loads((tmp_path / "sources.json").read_text())
    assert persisted["databricks_browse"] == {"catalog": "graphos", "schema_name": "default"}

    # /api/schema no longer needs catalog/schema_name query params once persisted.
    schema_res = client.get("/api/schema", params={"source": "databricks"})
    assert schema_res.status_code == 200
    table_names = {t["name"] for t in schema_res.json()["tables"]}
    assert "trades" in table_names


def test_edit_databricks_env_source_requires_both_fields(client, monkeypatch):
    monkeypatch.setenv("DATABRICKS_HOST", "https://test.cloud.databricks.com")
    monkeypatch.setenv("DATABRICKS_TOKEN", "fake-token")
    _make_fake_databricks_client(monkeypatch)

    res = client.patch("/api/sources/test", json={"catalog": "graphos"})
    assert res.status_code == 400


def test_introspect_databricks_env_source_checks_the_persisted_catalog_and_schema(client, monkeypatch):
    monkeypatch.setenv("DATABRICKS_HOST", "https://test.cloud.databricks.com")
    monkeypatch.setenv("DATABRICKS_TOKEN", "fake-token")
    _make_fake_databricks_client(monkeypatch)

    client.patch("/api/sources/test", json={"catalog": "graphos", "schema_name": "default"})
    res = client.post("/api/sources/test/introspect")
    assert res.status_code == 200


def test_edit_extra_sqlite_source_updates_its_uri(client, tmp_path):
    import sqlite3

    client.post(
        "/api/sources",
        json={"name": "reporting-db", "uri": "sqlite:///first.db", "kind": "sqlite"},
    )
    other_db = tmp_path / "second.db"
    conn = sqlite3.connect(str(other_db))
    conn.execute("CREATE TABLE gadgets (gadget_id INTEGER PRIMARY KEY)")
    conn.commit()
    conn.close()

    res = client.patch("/api/sources/reporting-db", json={"uri": f"sqlite:///{other_db}"})
    assert res.status_code == 200

    introspect_res = client.post("/api/sources/reporting-db/introspect")
    assert introspect_res.status_code == 200
    schema_res = client.get("/api/schema", params={"name": "reporting-db"})
    assert {t["name"] for t in schema_res.json()["tables"]} == {"gadgets"}


def test_edit_extra_databricks_source_rebuilds_the_uri(client, tmp_path):
    client.post(
        "/api/sources",
        json={
            "name": "dbc",
            "kind": "databricks",
            "host": "old-host.cloud.databricks.com",
            "warehouse_id": "old-warehouse",
            "token": "old-token",
        },
    )
    res = client.patch(
        "/api/sources/dbc",
        json={"host": "new-host.cloud.databricks.com", "warehouse_id": "new-warehouse", "token": "new-token"},
    )
    assert res.status_code == 200

    persisted = json.loads((tmp_path / "sources.json").read_text())
    dbc_entry = next(s for s in persisted["extra"] if s["name"] == "dbc")
    assert "new-host.cloud.databricks.com" in dbc_entry["uri"]
    assert "new-warehouse" in dbc_entry["uri"]
    assert "new-token" in dbc_entry["uri"]
    assert "old-host" not in dbc_entry["uri"]


def test_edit_unknown_source_returns_404(client):
    res = client.patch("/api/sources/does-not-exist", json={"uri": "sqlite:///x.db"})
    assert res.status_code == 404
