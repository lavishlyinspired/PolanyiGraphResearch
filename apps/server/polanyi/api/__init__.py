"""Polanyi Works API — serves the semantic runtime and the Studio UI."""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Ensure execution-runtime is importable for Databricks connector
_exec_rt = str(Path(__file__).resolve().parents[4] / "packages" / "execution-runtime")
if _exec_rt not in sys.path:
    sys.path.insert(0, _exec_rt)

from polanyi import __version__
from polanyi.demo import DEMO_BUSINESS_RULES
from polanyi.semantic.generate import generate_context
from polanyi.semantic.introspect import introspect
from polanyi.kernel.llm import llm_mode, resolve_llm
from polanyi.semantic.embeddings import EmbeddingOntologyIndex, resolve_embedding_provider
from polanyi.models import BusinessRule, SemanticContext
from polanyi.execution.validate import validate_sql
from polanyi.execution.sql import execute_sql

DEFAULT_DB_PATH = "semantics/knowledge/financial_demo.db"
CONTEXT_FILENAME = "semantic_context.json"
SOURCES_FILENAME = "sources.json"


def _primary_source_name(db_uri: str) -> str:
    return Path(db_uri.split("///")[-1]).name if "///" in db_uri else db_uri


def _databricks_source_name() -> Optional[str]:
    hostname = os.environ.get("DATABRICKS_HOST", "")
    if not hostname:
        return None
    return hostname.replace("https://", "").replace("http://", "").split(".")[0]


def _relative_time(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    seconds = int((datetime.now() - dt).total_seconds())
    if seconds < 60:
        return "just now"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes} min ago"
    hours = minutes // 60
    if hours < 24:
        return f"{hours} h ago"
    days = hours // 24
    return f"{days} d ago"


def _kind_label(dialect: str) -> str:
    if dialect == "sqlite":
        return "SQLite"
    if dialect == "databricks":
        return "Databricks · Unity Catalog"
    return dialect.title()


def _build_databricks_uri(host: str, warehouse_id: str, token: str) -> str:
    """Build a databricks-sqlalchemy URI from separate fields, so users never
    have to know the URI shape (or worse, paste the workspace URL as-is)."""
    clean_host = host.strip().replace("https://", "").replace("http://", "").rstrip("/")
    return f"databricks://token:{token.strip()}@{clean_host}/sql/1.0/warehouses/{warehouse_id.strip()}"


def _friendly_introspect_error(exc: Exception) -> str:
    """Translate a raw SQLAlchemy/DBAPI exception into an actionable message.

    Users should never see things like "Can't load plugin: sqlalchemy.dialects:https"
    — that's a URI-scheme parsing detail, not something that tells them what to fix.
    """
    from sqlalchemy.exc import ArgumentError, NoSuchModuleError

    if isinstance(exc, NoSuchModuleError):
        return (
            "Unrecognized connection type in the URI. It must start with a known "
            "prefix — sqlite://, postgresql://, mysql://, or databricks://."
        )
    if isinstance(exc, ArgumentError):
        return f"Malformed connection URI: {exc}"

    # SQLAlchemy wraps DBAPI errors as "(module.path.Exception) detail
    # \n(Background on this error at: ...)" — strip both, they're internal
    # plumbing, not something a user should have to parse.
    message = str(exc)
    message = re.sub(r"^\([\w.]+\)\s*", "", message)
    message = re.sub(r"\s*\(Background on this error at:.*?\)\s*$", "", message, flags=re.DOTALL).strip()

    lowered = message.lower()
    if "unable to open database file" in lowered or "no such file or directory" in lowered:
        return "Database file not found. Check the file path in the connection URI."
    if any(
        term in lowered
        for term in (
            "authentication",
            "invalid access token",
            "unauthorized",
            "401",
            "403",
            "permission denied",
            "credential",
        )
    ):
        return "Authentication failed. Check the access token or credentials are correct and not expired."
    if any(term in lowered for term in ("could not connect", "connection refused", "timed out", "timeout", "name or service not known")):
        return "Couldn't reach the host. Check the workspace host / server address and network access."
    if "does not exist" in lowered or "unknown database" in lowered or "not found" in lowered:
        return f"Database, warehouse, or schema not found: {message}"
    return f"Connection failed: {message}"


class ValidateRequest(BaseModel):
    sql: str


class CypherRequest(BaseModel):
    query: str


class SparqlRequest(BaseModel):
    query: str


class AskRequest(BaseModel):
    question: str
    session_id: Optional[str] = None


class GenerateRequest(BaseModel):
    use_llm: bool = True


class AlignmentDecisionRequest(BaseModel):
    """Optional body for accept/reject — names a specific candidate from the
    review queue's top-N list rather than the algorithmically-best one."""

    candidate_uri: Optional[str] = None


class IngestDocumentRequest(BaseModel):
    text: str
    title: Optional[str] = None


class ConnectSourceRequest(BaseModel):
    name: str
    kind: str
    uri: Optional[str] = None
    # Databricks-specific: supplied instead of `uri` so the backend builds the
    # actual connection string — users shouldn't need to know its shape.
    host: Optional[str] = None
    warehouse_id: Optional[str] = None
    token: Optional[str] = None


class EditSourceRequest(BaseModel):
    uri: Optional[str] = None
    host: Optional[str] = None
    warehouse_id: Optional[str] = None
    token: Optional[str] = None
    catalog: Optional[str] = None
    schema_name: Optional[str] = None


def create_app(
    db_uri: Optional[str] = None,
    rules: Optional[list[BusinessRule]] = None,
    artifacts_dir: str = "semantics/knowledge/semantic-models",
    ui_dist: str = "apps/studio/dist",
) -> FastAPI:
    db_uri = db_uri or f"sqlite:///{DEFAULT_DB_PATH}"
    rules = rules if rules is not None else DEMO_BUSINESS_RULES
    context_path = Path(artifacts_dir) / CONTEXT_FILENAME
    sources_path = Path(artifacts_dir) / SOURCES_FILENAME

    def _load_sources_config() -> dict:
        default: dict = {
            "extra": [],
            "databricks_browse": {"catalog": None, "schema_name": None},
            "primary_uri_override": None,
        }
        if not sources_path.exists():
            return default
        raw = json.loads(sources_path.read_text(encoding="utf-8"))
        if isinstance(raw, list):
            # Older format: a flat list of extra sources, nothing else persisted.
            return {**default, "extra": raw}
        return {**default, **raw}

    def _save_sources_config() -> None:
        sources_path.parent.mkdir(parents=True, exist_ok=True)
        sources_path.write_text(
            json.dumps(
                {
                    "extra": state["extra_sources"],
                    "databricks_browse": state["databricks_browse"],
                    "primary_uri_override": state["primary_uri_override"],
                },
                indent=2,
            ),
            encoding="utf-8",
        )

    app = FastAPI(title="Polanyi Works", version=__version__)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    _sources_config = _load_sources_config()
    state: dict = {
        "snapshot": None,
        "snapshot_at": None,
        "context": None,
        "agent": None,
        "databricks_client": None,
        "embedding_index": None,
        "extra_sources": _sources_config["extra"],
        "extra_snapshots": {},
        "extra_introspected_at": {},
        "databricks_browse": _sources_config["databricks_browse"],
        "primary_uri_override": _sources_config["primary_uri_override"],
    }

    def effective_db_uri() -> str:
        """The primary source's URI, or a user-set override — editing the
        primary connection swaps this without restarting the server."""
        return state["primary_uri_override"] or db_uri

    def snapshot():
        if state["snapshot"] is None:
            state["snapshot"] = introspect(effective_db_uri())
            state["snapshot_at"] = datetime.now()
        return state["snapshot"]

    def databricks_client():
        """Reuse one DatabricksClient per app lifetime so the SDK auth handshake
        and SQL warehouse connection aren't paid on every request."""
        if state["databricks_client"] is None:
            state["databricks_client"] = _get_databricks_client()
        return state["databricks_client"]

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

    def embedding_index_for(store):
        """Lazily build + cache the FIBO embedding index once per app lifetime
        (the corpus fetch + embedding pass are too slow to repeat per request).
        Optional — mirrors the LLM-optional posture: returns None when no
        embedding provider is configured or installed."""
        if state["embedding_index"] is None:
            provider = resolve_embedding_provider()
            if provider is None:
                return None
            state["embedding_index"] = EmbeddingOntologyIndex(provider, store.all_classes())
        return state["embedding_index"]

    @app.get("/api/health")
    def health():
        return {
            "status": "ok",
            "version": __version__,
            "llm_mode": llm_mode(),
            "db_uri": _redact(effective_db_uri()),
            "graphdb": _graphdb_health(),
            "neo4j": _neo4j_health(),
        }

    @app.get("/api/sources")
    def sources():
        snap = snapshot()
        result = [
            {
                "name": _primary_source_name(effective_db_uri()),
                "dialect": snap.dialect,
                "kind": _kind_label(snap.dialect),
                "uri": _redact(effective_db_uri()),
                "table_count": len(snap.tables),
                "status": "connected",
                "last_introspected": _relative_time(state["snapshot_at"]),
                "objects_label": f"{len(snap.tables)} tables",
                "is_primary": True,
                "removable": False,
                "catalog": None,
                "schema_name": None,
            }
        ]
        hostname = os.environ.get("DATABRICKS_HOST", "")
        if hostname:
            short = _databricks_source_name()
            browse_catalog = state["databricks_browse"].get("catalog")
            browse_schema = state["databricks_browse"].get("schema_name")
            db_client = databricks_client()
            if db_client is not None:
                try:
                    catalogs = db_client.list_catalogs()
                    result.append(
                        {
                            "name": short,
                            "dialect": "databricks",
                            "kind": "Databricks · Unity Catalog",
                            "uri": hostname,
                            "table_count": 0,
                            "status": "connected",
                            "last_introspected": None,
                            "objects_label": f"{len(catalogs)} catalogs",
                            "is_primary": False,
                            "removable": False,
                            "catalog": browse_catalog,
                            "schema_name": browse_schema,
                        }
                    )
                except Exception:  # noqa: BLE001
                    result.append(
                        {
                            "name": short,
                            "dialect": "databricks",
                            "kind": "Databricks · Unity Catalog",
                            "uri": hostname,
                            "table_count": 0,
                            "status": "error",
                            "last_introspected": None,
                            "objects_label": "connection failed",
                            "is_primary": False,
                            "removable": False,
                            "catalog": browse_catalog,
                            "schema_name": browse_schema,
                        }
                    )
            else:
                result.append(
                    {
                        "name": short,
                        "dialect": "databricks",
                        "kind": "Databricks · Unity Catalog",
                        "uri": hostname,
                        "table_count": 0,
                        "status": "configured",
                        "last_introspected": None,
                        "objects_label": "credentials missing",
                        "is_primary": False,
                        "removable": False,
                        "catalog": browse_catalog,
                        "schema_name": browse_schema,
                    }
                )
        for entry in state["extra_sources"]:
            name = entry["name"]
            extra_snap = state["extra_snapshots"].get(name)
            table_count = len(extra_snap.tables) if extra_snap is not None else 0
            result.append(
                {
                    "name": name,
                    "dialect": entry["dialect"],
                    "kind": _kind_label(entry["dialect"]),
                    "uri": _redact(entry["uri"]),
                    "table_count": table_count,
                    "status": "connected" if extra_snap is not None else "configured",
                    "last_introspected": _relative_time(state["extra_introspected_at"].get(name)),
                    "objects_label": f"{table_count} tables" if extra_snap is not None else "not introspected",
                    "is_primary": False,
                    "removable": True,
                    "catalog": None,
                    "schema_name": None,
                }
            )
        return result

    @app.post("/api/sources")
    def connect_source(req: ConnectSourceRequest):
        name = req.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="A connection name is required")

        if req.kind == "databricks":
            missing = [
                label
                for label, value in [
                    ("workspace host", req.host),
                    ("SQL warehouse ID", req.warehouse_id),
                    ("access token", req.token),
                ]
                if not (value or "").strip()
            ]
            if missing:
                raise HTTPException(
                    status_code=400,
                    detail=f"Missing required field(s): {', '.join(missing)}",
                )
            uri = _build_databricks_uri(req.host or "", req.warehouse_id or "", req.token or "")
        else:
            uri = (req.uri or "").strip()
            if not uri:
                raise HTTPException(status_code=400, detail="A connection URI is required")

        taken_names = {_primary_source_name(effective_db_uri()), _databricks_source_name()}
        taken_names |= {s["name"] for s in state["extra_sources"]}
        if name in taken_names:
            raise HTTPException(status_code=409, detail=f"A source named '{name}' already exists")
        state["extra_sources"].append({"name": name, "uri": uri, "dialect": req.kind})
        _save_sources_config()
        return sources()

    @app.delete("/api/sources/{name}")
    def disconnect_source(name: str):
        before = len(state["extra_sources"])
        state["extra_sources"] = [s for s in state["extra_sources"] if s["name"] != name]
        if len(state["extra_sources"]) == before:
            raise HTTPException(status_code=404, detail=f"No connected source named '{name}'")
        state["extra_snapshots"].pop(name, None)
        state["extra_introspected_at"].pop(name, None)
        _save_sources_config()
        return sources()

    @app.patch("/api/sources/{name}")
    def edit_source(name: str, req: EditSourceRequest):
        primary_name = _primary_source_name(effective_db_uri())
        databricks_name = _databricks_source_name()

        if name == primary_name:
            new_uri = (req.uri or "").strip()
            if not new_uri:
                raise HTTPException(status_code=400, detail="A connection URI is required")
            previous_override = state["primary_uri_override"]
            state["primary_uri_override"] = new_uri
            state["snapshot"] = None
            try:
                snap = snapshot()
            except Exception as exc:  # noqa: BLE001
                state["primary_uri_override"] = previous_override
                state["snapshot"] = None
                raise HTTPException(status_code=502, detail=_friendly_introspect_error(exc)) from exc
            # Regenerate immediately (deterministic) rather than lazily —
            # otherwise context() would reload the now-stale context.json
            # from before the URI changed.
            ctx = generate_context(snap, rules, llm=None, previous=context())
            state["context"] = ctx
            state["agent"] = None
            save_context(ctx)
            _save_sources_config()
            return sources()

        if databricks_name is not None and name == databricks_name:
            catalog = (req.catalog or "").strip()
            new_schema_name = (req.schema_name or "").strip()
            if not catalog or not new_schema_name:
                raise HTTPException(status_code=400, detail="catalog and schema_name are required")
            state["databricks_browse"] = {"catalog": catalog, "schema_name": new_schema_name}
            _save_sources_config()
            return sources()

        entry = next((s for s in state["extra_sources"] if s["name"] == name), None)
        if entry is None:
            raise HTTPException(status_code=404, detail=f"No connected source named '{name}'")

        if entry["dialect"] == "databricks":
            if req.host or req.warehouse_id or req.token:
                missing = [
                    label
                    for label, value in [
                        ("workspace host", req.host),
                        ("SQL warehouse ID", req.warehouse_id),
                        ("access token", req.token),
                    ]
                    if not (value or "").strip()
                ]
                if missing:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Missing required field(s): {', '.join(missing)}",
                    )
                entry["uri"] = _build_databricks_uri(req.host or "", req.warehouse_id or "", req.token or "")
        elif req.uri and req.uri.strip():
            entry["uri"] = req.uri.strip()

        state["extra_snapshots"].pop(name, None)
        state["extra_introspected_at"].pop(name, None)
        _save_sources_config()
        return sources()

    @app.post("/api/sources/{name}/introspect")
    def introspect_source(name: str):
        if name == _primary_source_name(effective_db_uri()):
            state["snapshot"] = None
            snapshot()
            return sources()

        databricks_name = _databricks_source_name()
        if databricks_name is not None and name == databricks_name:
            # There's no single "introspect the connection" step here — its
            # catalog list is already live on every /api/sources call. If a
            # catalog/schema is configured, re-check that it's still reachable.
            cat = state["databricks_browse"].get("catalog")
            sch = state["databricks_browse"].get("schema_name")
            if cat and sch:
                client = databricks_client()
                if client is None:
                    raise HTTPException(status_code=503, detail="Databricks not configured")
                try:
                    client.list_tables(catalog=cat, schema=sch)
                except Exception as exc:  # noqa: BLE001
                    raise HTTPException(status_code=502, detail=_friendly_introspect_error(exc)) from exc
            return sources()

        entry = next((s for s in state["extra_sources"] if s["name"] == name), None)
        if entry is None:
            raise HTTPException(status_code=404, detail=f"No connected source named '{name}'")
        try:
            state["extra_snapshots"][name] = introspect(entry["uri"])
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=_friendly_introspect_error(exc)) from exc
        state["extra_introspected_at"][name] = datetime.now()
        return sources()

    @app.get("/api/databricks/status")
    def databricks_status():
        if not os.environ.get("DATABRICKS_HOST"):
            return {"connected": False, "host": "", "catalogs": [], "error": "DATABRICKS_HOST not set"}
        try:
            client = databricks_client()
            if client is None:
                return {
                    "connected": False,
                    "host": os.environ.get("DATABRICKS_HOST", ""),
                    "catalogs": [],
                    "error": "Failed to create Databricks client",
                }
            catalogs = client.list_catalogs()
            return {
                "connected": True,
                "host": os.environ.get("DATABRICKS_HOST", ""),
                "catalogs": catalogs,
                "error": None,
            }
        except Exception as exc:  # noqa: BLE001
            return {
                "connected": False,
                "host": os.environ.get("DATABRICKS_HOST", ""),
                "catalogs": [],
                "error": str(exc),
            }

    @app.get("/api/databricks/schemas")
    def databricks_schemas(catalog: str = Query(...)):
        if not os.environ.get("DATABRICKS_HOST"):
            raise HTTPException(status_code=503, detail="Databricks not configured")
        try:
            client = databricks_client()
            schemas = client.list_schemas(catalog=catalog)
            return {"schemas": schemas}
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=f"Databricks schema list failed: {exc}") from exc

    @app.get("/api/schema")
    def schema(
        source: str = Query(default=""),
        name: str = Query(default=""),
        catalog: str = Query(default=""),
        schema_name: str = Query(default=""),
    ):
        if source == "databricks":
            cat = catalog or (state["databricks_browse"].get("catalog") or "")
            sch = schema_name or (state["databricks_browse"].get("schema_name") or "")
            if not cat or not sch:
                raise HTTPException(status_code=400, detail="catalog and schema_name required for Databricks source")
            client = databricks_client()
            if client is None:
                raise HTTPException(status_code=503, detail="Databricks not configured")
            try:
                tables_meta = client.list_tables(catalog=cat, schema=sch)
                tables = [
                    {
                        "name": t["name"],
                        "columns": t.get("columns", []),
                        "foreign_keys": t.get("foreign_keys", []),
                    }
                    for t in tables_meta
                ]
                return {"dialect": "databricks", "tables": tables}
            except Exception as exc:  # noqa: BLE001
                raise HTTPException(status_code=502, detail=f"Databricks introspection failed: {exc}") from exc
        if name:
            entry = next((s for s in state["extra_sources"] if s["name"] == name), None)
            if entry is None:
                raise HTTPException(status_code=404, detail=f"Unknown source '{name}'")
            extra_snap = state["extra_snapshots"].get(name)
            if extra_snap is None:
                return {"dialect": entry["dialect"], "tables": []}
            return extra_snap.model_dump()
        return snapshot().model_dump()

    @app.get("/api/context")
    def get_context():
        return context().model_dump()

    @app.post("/api/context/generate")
    def regenerate(req: GenerateRequest):
        llm = resolve_llm("pipeline") if req.use_llm else None
        ctx = generate_context(
            snapshot(), rules, llm=llm, db_uri=effective_db_uri(), previous=context()
        )
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

            state["registry"] = default_registry(effective_db_uri(), context().business_rules)
        return state["registry"].catalog()

    @app.post("/api/validate")
    def validate(req: ValidateRequest):
        return validate_sql(req.sql, context().business_rules).model_dump()

    @app.post("/api/sql/execute")
    def sql_execute(req: ValidateRequest):
        return execute_sql(req.sql, context().business_rules, effective_db_uri()).model_dump()

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

            state["agent"] = SemanticAgent(effective_db_uri(), context(), llm)
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
        from rdflib import RDF

        from polanyi.semantic.documents import (
            DOCUMENTS_GRAPH_IRI,
            DocumentExtraction,
            IngestedDocument,
            document_to_rdf,
            make_extractor,
            resolve_mentions,
            scan_glossary_terms,
        )
        from polanyi.semantic.ontology import graphdb_configured
        from polanyi.semantic.rdf import GOS, publish_to_graphdb, validate_rdf

        extractor = make_extractor(resolve_llm("pipeline"))
        doc = IngestedDocument(
            source=req.title or "api-upload",
            title=req.title or "Untitled document",
            text=req.text,
            extraction=DocumentExtraction(),
        )
        doc.extraction = extractor.extract(req.text)
        # Glossary terms are known up front — string-match them in even when
        # the extractor misses a metric, guaranteeing document->term links.
        already_extracted = {m.text.lower() for m in doc.extraction.mentions}
        doc.extraction.mentions.extend(
            m for m in scan_glossary_terms(req.text, context()) if m.text.lower() not in already_extracted
        )
        doc = resolve_mentions(doc, context())
        graph = document_to_rdf(doc)
        conforms, report = validate_rdf(graph)
        if not conforms:
            raise HTTPException(status_code=422, detail=f"SHACL validation failed: {report}")

        published_uri = None
        if graphdb_configured():
            try:
                publish_to_graphdb(graph, named_graph=DOCUMENTS_GRAPH_IRI, replace=False)
                published_uri = str(next(graph.subjects(RDF.type, GOS.Document)))
            except Exception:  # noqa: BLE001 — persistence is best-effort; the parsed
                # result below is still real and useful even if publishing fails
                published_uri = None

        return {
            "mentions": [m.model_dump() for m in doc.extraction.mentions],
            "triples": len(graph),
            "extractor": type(extractor).__name__,
            "published_uri": published_uri,
        }

    @app.post("/api/context/align")
    def align_context():
        from polanyi.semantic.ontology import GraphDBOntologyStore, align_glossary, graphdb_configured

        if not graphdb_configured():
            raise HTTPException(status_code=503, detail="GRAPHDB_ENDPOINT not configured")
        store = GraphDBOntologyStore()
        if not store.is_available():
            raise HTTPException(status_code=503, detail="GraphDB is not reachable")
        ctx = align_glossary(
            context(), store, llm=resolve_llm("pipeline"), embedding_index=embedding_index_for(store)
        )
        state["context"] = ctx
        state["agent"] = None
        save_context(ctx)
        aligned = [g.term for g in ctx.glossary if g.ontology_uri]
        return {"aligned_terms": aligned, "total_terms": len(ctx.glossary)}

    @app.get("/api/context/align/queue")
    def alignment_review_queue():
        from polanyi.semantic.ontology import (
            GraphDBOntologyStore,
            alignment_queue,
            graphdb_configured,
        )

        if not graphdb_configured():
            raise HTTPException(status_code=503, detail="GRAPHDB_ENDPOINT not configured")
        store = GraphDBOntologyStore()
        if not store.is_available():
            raise HTTPException(status_code=503, detail="GraphDB is not reachable")
        return alignment_queue(
            context(), store, llm=resolve_llm("pipeline"), embedding_index=embedding_index_for(store)
        )

    @app.post("/api/context/align/{term}/accept")
    def accept_alignment_candidate(term: str, req: AlignmentDecisionRequest = AlignmentDecisionRequest()):
        from polanyi.semantic.ontology import (
            GraphDBOntologyStore,
            accept_alignment,
            alignment_queue,
            graphdb_configured,
        )

        if not graphdb_configured():
            raise HTTPException(status_code=503, detail="GRAPHDB_ENDPOINT not configured")
        store = GraphDBOntologyStore()
        if not store.is_available():
            raise HTTPException(status_code=503, detail="GraphDB is not reachable")
        llm = resolve_llm("pipeline")
        index = embedding_index_for(store)
        try:
            ctx = accept_alignment(
                context(), term, store, llm=llm, embedding_index=index, candidate_uri=req.candidate_uri
            )
        except LookupError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        state["context"] = ctx
        state["agent"] = None
        save_context(ctx)
        return alignment_queue(ctx, store, llm=llm, embedding_index=index)

    @app.post("/api/context/align/{term}/reject")
    def reject_alignment_candidate(term: str, req: AlignmentDecisionRequest = AlignmentDecisionRequest()):
        from polanyi.semantic.ontology import (
            GraphDBOntologyStore,
            alignment_queue,
            graphdb_configured,
            reject_alignment,
        )

        if not graphdb_configured():
            raise HTTPException(status_code=503, detail="GRAPHDB_ENDPOINT not configured")
        store = GraphDBOntologyStore()
        if not store.is_available():
            raise HTTPException(status_code=503, detail="GraphDB is not reachable")
        llm = resolve_llm("pipeline")
        index = embedding_index_for(store)
        try:
            ctx = reject_alignment(
                context(), term, store, llm=llm, embedding_index=index, candidate_uri=req.candidate_uri
            )
        except LookupError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        state["context"] = ctx
        state["agent"] = None
        save_context(ctx)
        return alignment_queue(ctx, store, llm=llm, embedding_index=index)

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

    @app.post("/api/sparql")
    def sparql(req: SparqlRequest):
        from polanyi.semantic.ontology import GraphDBOntologyStore, graphdb_configured
        from polanyi.semantic.rdf import context_to_rdf, local_sparql

        if graphdb_configured():
            store = GraphDBOntologyStore()
            if store.is_available():
                return {"engine": "graphdb", "rows": store.sparql_query(req.query)}
        graph = context_to_rdf(context())
        turtle = graph.serialize(format="turtle")
        return {"engine": "local", "rows": local_sparql(turtle, req.query)}

    @app.post("/api/graph/query")
    def graph_query(req: CypherRequest):
        from polanyi.execution.knowledge_graph import (
            Neo4jGraphStore,
            guard_cypher,
            neo4j_configured,
        )

        violation = guard_cypher(req.query)
        if violation:
            raise HTTPException(status_code=400, detail=violation)
        if not neo4j_configured():
            raise HTTPException(status_code=503, detail="NEO4J_URI not configured")
        store = Neo4jGraphStore()
        if not store.is_available():
            raise HTTPException(status_code=503, detail="Neo4j is not reachable")
        try:
            return {"rows": store.run_cypher(req.query)}
        finally:
            store.close()

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

    @app.get("/api/graph/stats")
    def graph_stats():
        from polanyi.execution.knowledge_graph import Neo4jGraphStore, neo4j_configured

        if not neo4j_configured():
            raise HTTPException(status_code=503, detail="NEO4J_URI not configured")
        # Bounded timeout: this backs an Overview dashboard tile loaded on every
        # page view, so an unreachable Neo4j must fail fast, not hang the page.
        store = Neo4jGraphStore(connection_timeout=3)
        if not store.is_available():
            store.close()
            raise HTTPException(status_code=503, detail="Neo4j is not reachable")
        try:
            nodes = store.run_cypher("MATCH (n) RETURN count(n) AS nodes")[0]["nodes"]
            edges = store.run_cypher("MATCH ()-[r]->() RETURN count(r) AS edges")[0]["edges"]
            return {"nodes": nodes, "edges": edges}
        finally:
            store.close()

    _mount_ui(app, ui_dist)
    return app


def _redact(uri: str) -> str:
    if "@" in uri and "://" in uri:
        scheme, rest = uri.split("://", 1)
        return f"{scheme}://***@{rest.split('@', 1)[1]}"
    return uri


def _get_databricks_client():
    """Create a DatabricksClient from env vars, or return None if unconfigured."""
    if not os.environ.get("DATABRICKS_HOST"):
        return None
    try:
        from execution.connectors.databricks import DatabricksConfig, DatabricksClient

        config = DatabricksConfig.from_env()
        return DatabricksClient(config)
    except Exception:  # noqa: BLE001
        return None


def _graphdb_health() -> dict:
    """Real-time GraphDB connectivity — bounded by is_available()'s own 3s
    timeout, so a health check can never hang the page that displays it."""
    from polanyi.semantic.ontology import GraphDBOntologyStore, graphdb_configured

    if not graphdb_configured():
        return {"configured": False, "available": False}
    try:
        return {"configured": True, "available": GraphDBOntologyStore().is_available()}
    except Exception:  # noqa: BLE001
        return {"configured": True, "available": False}


def _neo4j_health() -> dict:
    """Real-time Neo4j connectivity, with a short connection timeout — a
    misconfigured or unreachable Neo4j must never hang a health check."""
    from polanyi.execution.knowledge_graph import Neo4jGraphStore, neo4j_configured

    if not neo4j_configured():
        return {"configured": False, "available": False}
    store = None
    try:
        store = Neo4jGraphStore(connection_timeout=3)
        return {"configured": True, "available": store.is_available()}
    except Exception:  # noqa: BLE001
        return {"configured": True, "available": False}
    finally:
        if store is not None:
            store.close()


def _mount_ui(app: FastAPI, ui_dist: str) -> None:
    dist = Path(ui_dist)
    if dist.is_dir() and (dist / "index.html").exists():
        from fastapi.staticfiles import StaticFiles

        app.mount("/", StaticFiles(directory=str(dist), html=True), name="studio")


def load_rules_file(path: str) -> list[BusinessRule]:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return [BusinessRule.model_validate(item) for item in raw]
