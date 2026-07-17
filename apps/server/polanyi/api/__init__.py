"""Polanyi Works API — serves the semantic runtime and the Studio UI."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from polanyi import __version__
from polanyi.demo import DEMO_BUSINESS_RULES
from polanyi.semantic.generate import generate_context
from polanyi.semantic.introspect import introspect
from polanyi.kernel.llm import llm_mode, resolve_llm
from polanyi.models import BusinessRule, SemanticContext
from polanyi.execution.validate import validate_sql

DEFAULT_DB_PATH = "semantics/knowledge/financial_demo.db"
CONTEXT_FILENAME = "semantic_context.json"


class ValidateRequest(BaseModel):
    sql: str


class AskRequest(BaseModel):
    question: str
    session_id: Optional[str] = None


class GenerateRequest(BaseModel):
    use_llm: bool = True


class IngestDocumentRequest(BaseModel):
    text: str
    title: Optional[str] = None


def create_app(
    db_uri: Optional[str] = None,
    rules: Optional[list[BusinessRule]] = None,
    artifacts_dir: str = "semantics/knowledge/semantic-models",
    ui_dist: str = "apps/studio/dist",
) -> FastAPI:
    db_uri = db_uri or f"sqlite:///{DEFAULT_DB_PATH}"
    rules = rules if rules is not None else DEMO_BUSINESS_RULES
    context_path = Path(artifacts_dir) / CONTEXT_FILENAME

    app = FastAPI(title="Polanyi Works", version=__version__)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    state: dict = {"snapshot": None, "context": None, "agent": None}

    def snapshot():
        if state["snapshot"] is None:
            state["snapshot"] = introspect(db_uri)
        return state["snapshot"]

    def context() -> SemanticContext:
        if state["context"] is None:
            if context_path.exists():
                state["context"] = SemanticContext.model_validate_json(
                    context_path.read_text(encoding="utf-8")
                )
            else:
                state["context"] = generate_context(snapshot(), rules, llm=None)
        return state["context"]

    def save_context(ctx: SemanticContext) -> None:
        context_path.parent.mkdir(parents=True, exist_ok=True)
        context_path.write_text(ctx.model_dump_json(indent=2), encoding="utf-8")

    @app.get("/api/health")
    def health():
        return {
            "status": "ok",
            "version": __version__,
            "llm_mode": llm_mode(),
            "db_uri": _redact(db_uri),
        }

    @app.get("/api/sources")
    def sources():
        snap = snapshot()
        result = [
            {
                "name": Path(db_uri.split("///")[-1]).name if "///" in db_uri else db_uri,
                "dialect": snap.dialect,
                "uri": _redact(db_uri),
                "table_count": len(snap.tables),
                "status": "connected",
            }
        ]
        if os.environ.get("DATABRICKS_HOST"):
            result.append(
                {
                    "name": "Databricks",
                    "dialect": "databricks",
                    "uri": os.environ["DATABRICKS_HOST"],
                    "table_count": 0,
                    "status": "configured",
                }
            )
        return result

    @app.get("/api/schema")
    def schema():
        return snapshot().model_dump()

    @app.get("/api/context")
    def get_context():
        return context().model_dump()

    @app.post("/api/context/generate")
    def regenerate(req: GenerateRequest):
        llm = resolve_llm("pipeline") if req.use_llm else None
        ctx = generate_context(snapshot(), rules, llm=llm)
        state["context"] = ctx
        state["agent"] = None
        save_context(ctx)
        return ctx.model_dump()

    @app.get("/api/rules")
    def get_rules():
        return [r.model_dump() for r in rules]

    @app.get("/api/capabilities")
    def get_capabilities():
        if state.get("registry") is None:
            from polanyi.kernel.capabilities import default_registry

            state["registry"] = default_registry(db_uri, context().business_rules)
        return state["registry"].catalog()

    @app.post("/api/validate")
    def validate(req: ValidateRequest):
        return validate_sql(req.sql, context().business_rules).model_dump()

    @app.post("/api/ask")
    def ask(req: AskRequest):
        if state["agent"] is None:
            llm = resolve_llm("agent")
            if llm is None:
                raise HTTPException(
                    status_code=503,
                    detail=(
                        "No LLM configured. Set NVIDIA_API_KEY, OPENAI_API_KEY, or "
                        "DATABRICKS_TOKEN + DATABRICKS_SERVING_ENDPOINT."
                    ),
                )
            from polanyi.agents.semantic_agent import SemanticAgent

            state["agent"] = SemanticAgent(db_uri, context(), llm)
        try:
            return state["agent"].ask(req.question, session_id=req.session_id).model_dump()
        except Exception as exc:  # noqa: BLE001 — agent/LLM failures become 502s
            raise HTTPException(status_code=502, detail=f"Agent failed: {exc}") from exc

    @app.get("/api/ontology/search")
    def ontology_search(q: str):
        from polanyi.semantic.ontology import GraphDBOntologyStore, graphdb_configured

        if not graphdb_configured():
            raise HTTPException(status_code=503, detail="GRAPHDB_ENDPOINT not configured")
        try:
            return [c.model_dump() for c in GraphDBOntologyStore().search_classes(q)]
        except Exception as exc:  # noqa: BLE001 — GraphDB failures become 502s
            raise HTTPException(status_code=502, detail=f"Ontology search failed: {exc}") from exc

    @app.get("/api/ontology/expand")
    def ontology_expand(uri: str):
        from polanyi.semantic.ontology import GraphDBOntologyStore, graphdb_configured

        if not graphdb_configured():
            raise HTTPException(status_code=503, detail="GRAPHDB_ENDPOINT not configured")
        try:
            return [c.model_dump() for c in GraphDBOntologyStore().expand_subclasses(uri)]
        except Exception as exc:  # noqa: BLE001 — GraphDB failures become 502s
            raise HTTPException(status_code=502, detail=f"Expansion failed: {exc}") from exc

    @app.get("/api/ontology/reason")
    def ontology_reason(uri: str):
        from polanyi.semantic.ontology import graphdb_configured
        from polanyi.semantic.owl import reason_about_class

        if not graphdb_configured():
            raise HTTPException(status_code=503, detail="GRAPHDB_ENDPOINT not configured")
        try:
            return reason_about_class(uri)
        except Exception as exc:  # noqa: BLE001 — reasoning failures become 502s
            raise HTTPException(status_code=502, detail=f"Reasoning failed: {exc}") from exc

    @app.post("/api/documents/ingest")
    def ingest_doc(req: "IngestDocumentRequest"):
        from polanyi.semantic.documents import (
            DocumentExtraction,
            IngestedDocument,
            document_to_rdf,
            make_extractor,
            resolve_mentions,
        )
        from polanyi.semantic.rdf import validate_rdf

        extractor = make_extractor(resolve_llm("pipeline"))
        doc = IngestedDocument(
            source=req.title or "api-upload",
            title=req.title or "Untitled document",
            text=req.text,
            extraction=DocumentExtraction(),
        )
        doc.extraction = extractor.extract(req.text)
        doc = resolve_mentions(doc, context())
        graph = document_to_rdf(doc)
        conforms, report = validate_rdf(graph)
        if not conforms:
            raise HTTPException(status_code=422, detail=f"SHACL validation failed: {report}")
        return {
            "mentions": [m.model_dump() for m in doc.extraction.mentions],
            "triples": len(graph),
        }

    @app.post("/api/context/align")
    def align_context():
        from polanyi.semantic.ontology import GraphDBOntologyStore, align_glossary, graphdb_configured

        if not graphdb_configured():
            raise HTTPException(status_code=503, detail="GRAPHDB_ENDPOINT not configured")
        store = GraphDBOntologyStore()
        if not store.is_available():
            raise HTTPException(status_code=503, detail="GraphDB is not reachable")
        ctx = align_glossary(context(), store, llm=resolve_llm("pipeline"))
        state["context"] = ctx
        state["agent"] = None
        save_context(ctx)
        aligned = [g.term for g in ctx.glossary if g.ontology_uri]
        return {"aligned_terms": aligned, "total_terms": len(ctx.glossary)}

    @app.get("/api/rdf")
    def get_rdf():
        from fastapi.responses import PlainTextResponse

        from polanyi.semantic.rdf import context_to_rdf

        turtle = context_to_rdf(context()).serialize(format="turtle")
        return PlainTextResponse(turtle, media_type="text/turtle")

    @app.post("/api/rdf/publish")
    def publish_rdf():
        from polanyi.semantic.ontology import graphdb_configured
        from polanyi.semantic.rdf import context_to_rdf, publish_to_graphdb, validate_rdf

        if not graphdb_configured():
            raise HTTPException(status_code=503, detail="GRAPHDB_ENDPOINT not configured")
        graph = context_to_rdf(context())
        conforms, report = validate_rdf(graph)
        if not conforms:
            raise HTTPException(status_code=422, detail=f"SHACL validation failed: {report}")
        named_graph = publish_to_graphdb(graph)
        return {"named_graph": named_graph, "triples": len(graph)}

    @app.post("/api/graph/materialize")
    def materialize_graph():
        from polanyi.execution.knowledge_graph import Neo4jGraphStore, neo4j_configured

        if not neo4j_configured():
            raise HTTPException(status_code=503, detail="NEO4J_URI not configured")
        store = Neo4jGraphStore()
        if not store.is_available():
            raise HTTPException(status_code=503, detail="Neo4j is not reachable")
        try:
            return store.materialize(context())
        finally:
            store.close()

    _mount_ui(app, ui_dist)
    return app


def _redact(uri: str) -> str:
    if "@" in uri and "://" in uri:
        scheme, rest = uri.split("://", 1)
        return f"{scheme}://***@{rest.split('@', 1)[1]}"
    return uri


def _mount_ui(app: FastAPI, ui_dist: str) -> None:
    dist = Path(ui_dist)
    if dist.is_dir() and (dist / "index.html").exists():
        from fastapi.staticfiles import StaticFiles

        app.mount("/", StaticFiles(directory=str(dist), html=True), name="studio")


def load_rules_file(path: str) -> list[BusinessRule]:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return [BusinessRule.model_validate(item) for item in raw]
