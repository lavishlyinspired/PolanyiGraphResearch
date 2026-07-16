"""GraphOS command-line interface."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from graphos.env import load_dotenv

DEFAULT_DB_PATH = "data/financial_demo.db"
DEFAULT_CONTEXT_PATH = "data/semantic_context.json"


def main(argv: list[str] | None = None) -> int:
    load_dotenv()
    parser = _build_parser()
    args = parser.parse_args(argv)
    if not hasattr(args, "func"):
        parser.print_help()
        return 1
    return args.func(args) or 0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="graphos",
        description="GraphOS — semantic runtime that grounds AI agents in your data",
    )
    sub = parser.add_subparsers(title="commands")

    p = sub.add_parser("init-demo", help="Create the demo financial database")
    p.add_argument("--path", default=DEFAULT_DB_PATH)
    p.set_defaults(func=cmd_init_demo)

    p = sub.add_parser("generate", help="Generate semantic context from a database")
    p.add_argument("--db", default=None, help="SQLAlchemy URI (default: demo db)")
    p.add_argument("--rules", default=None, help="Business rules JSON file")
    p.add_argument("--no-llm", action="store_true", help="Force deterministic engine")
    p.add_argument("--out", default=DEFAULT_CONTEXT_PATH)
    p.set_defaults(func=cmd_generate)

    p = sub.add_parser("context", help="Show the generated semantic context")
    p.add_argument("--path", default=DEFAULT_CONTEXT_PATH)
    p.set_defaults(func=cmd_context)

    p = sub.add_parser("validate", help="Validate SQL against the business rules")
    p.add_argument("sql")
    p.add_argument("--context", default=DEFAULT_CONTEXT_PATH)
    p.set_defaults(func=cmd_validate)

    p = sub.add_parser("ask", help="Ask the grounded agent a question")
    p.add_argument("question")
    p.add_argument("--db", default=None)
    p.add_argument("--context", default=DEFAULT_CONTEXT_PATH)
    p.set_defaults(func=cmd_ask)

    p = sub.add_parser("serve", help="Run the GraphOS API + Studio UI")
    p.add_argument("--db", default=None)
    p.add_argument("--rules", default=None)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8000)
    p.set_defaults(func=cmd_serve)

    p = sub.add_parser(
        "ingest-databricks", help="Push the demo dataset to a Databricks schema"
    )
    p.add_argument("--catalog", default=None)
    p.add_argument("--schema", default="graphos_demo")
    p.set_defaults(func=cmd_ingest_databricks)

    return parser


def _default_db(args_db: str | None) -> str:
    if args_db:
        return args_db
    if not Path(DEFAULT_DB_PATH).exists():
        print(f"Demo database not found at {DEFAULT_DB_PATH}. Run: graphos init-demo")
        sys.exit(1)
    return f"sqlite:///{DEFAULT_DB_PATH}"


def _load_rules(path: str | None):
    from graphos.demo import DEMO_BUSINESS_RULES

    if path is None:
        return DEMO_BUSINESS_RULES
    from graphos.api import load_rules_file

    return load_rules_file(path)


def cmd_init_demo(args) -> int:
    from graphos.demo import seed_demo_db

    Path(args.path).parent.mkdir(parents=True, exist_ok=True)
    seed_demo_db(args.path)
    print(f"Demo financial database ready at {args.path}")
    print("Next: graphos generate")
    return 0


def cmd_generate(args) -> int:
    from graphos.generate import generate_context
    from graphos.introspect import introspect
    from graphos.llm import llm_mode, resolve_llm

    db_uri = _default_db(args.db)
    rules = _load_rules(args.rules)
    llm = None if args.no_llm else resolve_llm("pipeline")
    mode = "deterministic" if llm is None else llm_mode()
    print(f"Introspecting {db_uri} ...")
    snapshot = introspect(db_uri)
    print(f"Found {len(snapshot.tables)} tables. Generating context ({mode}) ...")
    ctx = generate_context(snapshot, rules, llm=llm)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(ctx.model_dump_json(indent=2), encoding="utf-8")
    print(
        f"Semantic context written to {args.out} "
        f"({len(ctx.glossary)} glossary terms, {len(ctx.relationships)} relationships, "
        f"{len(ctx.business_rules)} rules, engine={ctx.generated_by})"
    )
    print('Next: graphos serve   (or: graphos ask "Which counterparties are sanctioned?")')
    return 0


def cmd_context(args) -> int:
    from graphos.models import SemanticContext

    path = Path(args.path)
    if not path.exists():
        print(f"No context at {path}. Run: graphos generate")
        return 1
    ctx = SemanticContext.model_validate_json(path.read_text(encoding="utf-8"))
    print(f"Domain: {ctx.domain}   (engine: {ctx.generated_by})")
    print(f"\nGlossary ({len(ctx.glossary)}):")
    for g in ctx.glossary:
        print(f"  - {g.term}: {g.definition[:80]}")
    print(f"\nRelationships ({len(ctx.relationships)}):")
    for r in ctx.relationships:
        print(f"  - {r.from_entity} --[{r.relationship_type}]--> {r.to_entity} via {r.foreign_key}")
    print(f"\nBusiness rules ({len(ctx.business_rules)}):")
    for b in ctx.business_rules:
        print(f"  - [{b.severity}] {b.rule_id} {b.name}")
    return 0


def cmd_validate(args) -> int:
    from graphos.models import SemanticContext
    from graphos.validate import validate_sql

    path = Path(args.context)
    if not path.exists():
        print(f"No context at {path}. Run: graphos generate")
        return 1
    ctx = SemanticContext.model_validate_json(path.read_text(encoding="utf-8"))
    result = validate_sql(args.sql, ctx.business_rules)
    if result.valid and not result.violations:
        print("✓ Query passes all business rules")
    for v in result.violations:
        marker = "✗" if v.severity == "CRITICAL" else "⚠"
        print(f"{marker} [{v.severity}] {v.rule_id}: {v.message}")
    return 0 if result.valid else 2


def cmd_ask(args) -> int:
    from graphos.agent import SemanticAgent
    from graphos.llm import resolve_llm
    from graphos.models import SemanticContext

    db_uri = _default_db(args.db)
    path = Path(args.context)
    if not path.exists():
        print(f"No context at {path}. Run: graphos generate")
        return 1
    ctx = SemanticContext.model_validate_json(path.read_text(encoding="utf-8"))
    llm = resolve_llm("agent")
    if llm is None:
        print(
            "No LLM configured. Set NVIDIA_API_KEY, OPENAI_API_KEY, or "
            "DATABRICKS_TOKEN + DATABRICKS_SERVING_ENDPOINT."
        )
        return 1
    agent = SemanticAgent(db_uri, ctx, llm)
    result = agent.ask(args.question)
    for step in result.steps:
        if step.kind == "tool_call":
            print(f"→ {step.name} {step.detail}")
        elif step.kind == "validation":
            marker = "✗" if step.name == "blocked" else "✓"
            print(f"{marker} validation {step.name}: {step.detail[:120]}")
    print(f"\n{result.answer}")
    return 0


def cmd_serve(args) -> int:
    import uvicorn

    from graphos.api import create_app

    db_uri = _default_db(args.db)
    rules = _load_rules(args.rules)
    app = create_app(db_uri=db_uri, rules=rules)
    print(f"GraphOS running at http://{args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
    return 0


def cmd_ingest_databricks(args) -> int:
    from graphos.ingest import ingest_demo_to_databricks

    return ingest_demo_to_databricks(catalog=args.catalog, schema=args.schema)


if __name__ == "__main__":
    sys.exit(main())
