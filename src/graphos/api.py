"""GraphOS API — serves the semantic runtime and the Studio UI."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from graphos import __version__
from graphos.demo import DEMO_BUSINESS_RULES
from graphos.generate import generate_context
from graphos.introspect import introspect
from graphos.llm import llm_mode, resolve_llm
from graphos.models import BusinessRule, SemanticContext
from graphos.validate import validate_sql

DEFAULT_DB_PATH = "data/financial_demo.db"
CONTEXT_FILENAME = "semantic_context.json"


class ValidateRequest(BaseModel):
    sql: str


class AskRequest(BaseModel):
    question: str


class GenerateRequest(BaseModel):
    use_llm: bool = True


def create_app(
    db_uri: Optional[str] = None,
    rules: Optional[list[BusinessRule]] = None,
    artifacts_dir: str = "data",
    ui_dist: str = "ui/dist",
) -> FastAPI:
    db_uri = db_uri or f"sqlite:///{DEFAULT_DB_PATH}"
    rules = rules if rules is not None else DEMO_BUSINESS_RULES
    context_path = Path(artifacts_dir) / CONTEXT_FILENAME

    app = FastAPI(title="GraphOS", version=__version__)
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
            from graphos.agent import SemanticAgent

            state["agent"] = SemanticAgent(db_uri, context(), llm)
        try:
            return state["agent"].ask(req.question).model_dump()
        except Exception as exc:  # noqa: BLE001 — agent/LLM failures become 502s
            raise HTTPException(status_code=502, detail=f"Agent failed: {exc}") from exc

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
