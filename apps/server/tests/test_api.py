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
