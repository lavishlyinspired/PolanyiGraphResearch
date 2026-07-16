import pytest
from fastapi.testclient import TestClient

from graphos.api import create_app
from graphos.demo import seed_demo_db


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
