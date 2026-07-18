"""Polanyi Works command-line interface."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from polanyi.kernel.env import load_dotenv

DEFAULT_DB_PATH = "semantics/knowledge/financial_demo.db"
DEFAULT_CONTEXT_PATH = "semantics/knowledge/semantic-models/semantic_context.json"


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
        prog="polanyi",
        description="Polanyi Works — semantic runtime that grounds AI agents in your data",
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

    p = sub.add_parser("serve", help="Run the Polanyi Works API + Studio UI")
    p.add_argument("--db", default=None)
    p.add_argument("--rules", default=None)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8000)
    p.set_defaults(func=cmd_serve)

    p = sub.add_parser(
        "ingest-databricks", help="Push the demo dataset to a Databricks schema"
    )
    p.add_argument("--catalog", default=None)
    p.add_argument("--schema", default="polanyi_demo")
    p.set_defaults(func=cmd_ingest_databricks)

    p = sub.add_parser("align", help="Align glossary terms with the ontology (GraphDB/FIBO)")
    p.add_argument("--context", default=DEFAULT_CONTEXT_PATH)
    p.set_defaults(func=cmd_align)

    p = sub.add_parser(
        "materialize", help="Project the semantic context into Neo4j as a knowledge graph"
    )
    p.add_argument("--context", default=DEFAULT_CONTEXT_PATH)
    p.set_defaults(func=cmd_materialize)

    p = sub.add_parser("rdf", help="Build + SHACL-validate the RDF form of the context")
    p.add_argument("--context", default=DEFAULT_CONTEXT_PATH)
    p.add_argument("--out", default="semantics/knowledge/rdf/semantic_context.ttl")
    p.set_defaults(func=cmd_rdf)

    p = sub.add_parser("publish", help="Publish the context RDF to GraphDB (named graph)")
    p.add_argument("--context", default=DEFAULT_CONTEXT_PATH)
    p.set_defaults(func=cmd_publish)

    p = sub.add_parser("sparql", help="Run SPARQL (GraphDB if configured, else local)")
    p.add_argument("query")
    p.add_argument("--ttl", default="semantics/knowledge/rdf/semantic_context.ttl")
    p.set_defaults(func=cmd_sparql)

    p = sub.add_parser(
        "ingest-document",
        help="Parse a document, extract mentions, resolve to glossary, publish RDF",
    )
    p.add_argument("path")
    p.add_argument("--context", default=DEFAULT_CONTEXT_PATH)
    p.add_argument("--no-publish", action="store_true", help="Skip GraphDB publishing")
    p.add_argument("--no-llm", action="store_true", help="Heuristic extraction only")
    p.set_defaults(func=cmd_ingest_document)

    p = sub.add_parser(
        "reason",
        help="OWL reasoning over aligned classes (Owlready2; HermiT when Java present)",
    )
    p.add_argument("--uri", default=None, help="Reason about a specific class URI")
    p.add_argument("--context", default=DEFAULT_CONTEXT_PATH)
    p.set_defaults(func=cmd_reason)

    p = sub.add_parser(
        "sync-rdf", help="Import the context RDF into Neo4j via neosemantics (n10s)"
    )
    p.add_argument("--ttl", default="semantics/knowledge/rdf/semantic_context.ttl")
    p.set_defaults(func=cmd_sync_rdf)

    return parser


def _default_db(args_db: str | None) -> str:
    if args_db:
        return args_db
    if not Path(DEFAULT_DB_PATH).exists():
        print(f"Demo database not found at {DEFAULT_DB_PATH}. Run: polanyi init-demo")
        sys.exit(1)
    return f"sqlite:///{DEFAULT_DB_PATH}"


def _load_rules(path: str | None):
    from polanyi.demo import DEMO_BUSINESS_RULES

    if path is None:
        return DEMO_BUSINESS_RULES
    from polanyi.api import load_rules_file

    return load_rules_file(path)


def cmd_init_demo(args) -> int:
    from polanyi.demo import seed_demo_db

    Path(args.path).parent.mkdir(parents=True, exist_ok=True)
    seed_demo_db(args.path)
    print(f"Demo financial database ready at {args.path}")
    print("Next: polanyi generate")
    return 0


def cmd_generate(args) -> int:
    from polanyi.semantic.generate import generate_context
    from polanyi.semantic.introspect import introspect
    from polanyi.kernel.llm import llm_mode, resolve_llm

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
    print('Next: polanyi serve   (or: polanyi ask "Which counterparties are sanctioned?")')
    return 0


def cmd_context(args) -> int:
    from polanyi.models import SemanticContext

    path = Path(args.path)
    if not path.exists():
        print(f"No context at {path}. Run: polanyi generate")
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
    from polanyi.models import SemanticContext
    from polanyi.execution.validate import validate_sql

    path = Path(args.context)
    if not path.exists():
        print(f"No context at {path}. Run: polanyi generate")
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
    from polanyi.agents.semantic_agent import SemanticAgent
    from polanyi.kernel.llm import resolve_llm
    from polanyi.models import SemanticContext

    db_uri = _default_db(args.db)
    path = Path(args.context)
    if not path.exists():
        print(f"No context at {path}. Run: polanyi generate")
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

    from polanyi.api import create_app

    db_uri = _default_db(args.db)
    rules = _load_rules(args.rules)
    app = create_app(db_uri=db_uri, rules=rules)
    print(f"Polanyi Works running at http://{args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
    return 0


def cmd_ingest_databricks(args) -> int:
    from polanyi.execution.ingest import ingest_demo_to_databricks

    return ingest_demo_to_databricks(catalog=args.catalog, schema=args.schema)


def cmd_align(args) -> int:
    from polanyi.models import SemanticContext
    from polanyi.semantic.ontology import GraphDBOntologyStore, align_glossary

    path = Path(args.context)
    if not path.exists():
        print(f"No context at {path}. Run: polanyi generate")
        return 1
    store = GraphDBOntologyStore()
    if not store.is_available():
        print(f"GraphDB not reachable at {store.endpoint}")
        return 1
    from polanyi.kernel.llm import resolve_llm

    llm = resolve_llm("pipeline")
    if llm is not None:
        print("Ambiguous candidates will be ranked by the LLM (retrieval-constrained)")
    ctx = SemanticContext.model_validate_json(path.read_text(encoding="utf-8"))
    aligned = align_glossary(ctx, store, llm=llm)
    path.write_text(aligned.model_dump_json(indent=2), encoding="utf-8")
    hits = [g for g in aligned.glossary if g.ontology_uri]
    print(f"Aligned {len(hits)}/{len(aligned.glossary)} glossary terms with {store.repository}:")
    for g in hits:
        print(f"  ✓ {g.term} → {g.ontology_class}  <{g.ontology_uri}>")
    return 0


def _load_context_file(path_str: str):
    from polanyi.models import SemanticContext

    path = Path(path_str)
    if not path.exists():
        print(f"No context at {path}. Run: polanyi generate")
        sys.exit(1)
    return SemanticContext.model_validate_json(path.read_text(encoding="utf-8"))


def cmd_rdf(args) -> int:
    from polanyi.semantic.rdf import context_to_rdf, validate_rdf

    ctx = _load_context_file(args.context)
    graph = context_to_rdf(ctx)
    conforms, report = validate_rdf(graph)
    if not conforms:
        print("✗ SHACL validation failed:")
        print(report)
        return 2
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(graph.serialize(format="turtle"), encoding="utf-8")
    print(f"✓ SHACL-valid RDF written to {args.out} ({len(graph)} triples)")
    print("Next: polanyi publish   (or query locally: polanyi sparql '<query>')")
    return 0


def cmd_publish(args) -> int:
    from polanyi.semantic.rdf import context_to_rdf, publish_to_graphdb, validate_rdf

    ctx = _load_context_file(args.context)
    graph = context_to_rdf(ctx)
    conforms, report = validate_rdf(graph)
    if not conforms:
        print("✗ Refusing to publish SHACL-invalid RDF:")
        print(report)
        return 2
    named_graph = publish_to_graphdb(graph)
    print(f"✓ Published {len(graph)} triples to GraphDB named graph <{named_graph}>")
    print("The enterprise glossary now sits next to FIBO — query with: polanyi sparql")
    return 0


def cmd_sparql(args) -> int:
    import json as json_module

    from polanyi.semantic.ontology import GraphDBOntologyStore, graphdb_configured

    store = GraphDBOntologyStore() if graphdb_configured() else None
    if store is not None and store.is_available():
        rows = store.sparql_query(args.query)
    else:
        from polanyi.semantic.rdf import local_sparql

        ttl_path = Path(args.ttl)
        if not ttl_path.exists():
            print(f"GraphDB not available and no local RDF at {ttl_path}. Run: polanyi rdf")
            return 1
        rows = local_sparql(ttl_path.read_text(encoding="utf-8"), args.query)

    print(json_module.dumps(rows, indent=2))
    return 0


def cmd_ingest_document(args) -> int:
    from collections import Counter

    from polanyi.semantic.documents import DOCUMENTS_GRAPH_IRI, ingest_document
    from polanyi.kernel.llm import resolve_llm
    from polanyi.semantic.rdf import publish_to_graphdb, validate_rdf

    if not Path(args.path).exists():
        print(f"Document not found: {args.path}")
        return 1
    ctx = _load_context_file(args.context)
    llm = None if args.no_llm else resolve_llm("pipeline")
    print(f"Ingesting {args.path} (extractor: {'llm' if llm else 'heuristic'}) ...")
    doc, graph = ingest_document(args.path, ctx, llm=llm)

    by_type = Counter(m.entity_type for m in doc.extraction.mentions)
    print(f"Extracted {len(doc.extraction.mentions)} mentions: "
          + ", ".join(f"{t}×{n}" for t, n in by_type.most_common()))
    for mention in doc.extraction.mentions:
        if mention.resolved_term:
            print(f"  ✓ '{mention.text}' → glossary term '{mention.resolved_term}'")

    conforms, report = validate_rdf(graph)
    if not conforms:
        print("✗ SHACL validation failed:")
        print(report)
        return 2
    print(f"✓ SHACL-valid document RDF ({len(graph)} triples)")

    out = Path("semantics/knowledge/documents") / (Path(args.path).stem + ".ttl")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(graph.serialize(format="turtle"), encoding="utf-8")
    print(f"Written to {out}")

    if not args.no_publish:
        from polanyi.semantic.ontology import GraphDBOntologyStore, graphdb_configured

        if graphdb_configured() and GraphDBOntologyStore().is_available():
            publish_to_graphdb(graph, named_graph=DOCUMENTS_GRAPH_IRI, replace=False)
            print(f"✓ Published to GraphDB named graph <{DOCUMENTS_GRAPH_IRI}>")
        else:
            print("GraphDB not available — skipped publishing")

        from polanyi.execution.knowledge_graph import Neo4jGraphStore, neo4j_configured

        if neo4j_configured():
            store = Neo4jGraphStore()
            if store.is_available():
                try:
                    stats = store.materialize_document(doc)
                finally:
                    store.close()
                print(
                    f"✓ Projected into Neo4j for Graph RAG: {stats['mentions']} mentions, "
                    f"{stats['linked_terms']} linked to glossary terms"
                )
    return 0


def cmd_reason(args) -> int:
    from polanyi.semantic.owl import OwlReasoner, java_available

    uris: list[tuple[str, str]] = []
    if args.uri:
        uris.append(("(explicit)", args.uri))
    else:
        ctx = _load_context_file(args.context)
        uris = [(g.term, g.ontology_uri) for g in ctx.glossary if g.ontology_uri]
        if not uris:
            print("No aligned glossary terms. Run: polanyi align  (or pass --uri)")
            return 1

    print(f"Java runtime: {'available — HermiT inference on' if java_available() else 'not found — structural traversal only (install a JDK for HermiT)'}")
    reasoner = OwlReasoner()
    reasoner.load_from_graphdb([uri for _, uri in uris])
    result = reasoner.run_reasoner()
    if result.ran:
        print(f"HermiT: consistent={result.consistent}")

    for term, uri in uris:
        ancestors = reasoner.ancestors(uri)
        descendants = reasoner.descendants(uri)
        chain = " → ".join(a.label for a in ancestors) or "(top-level class)"
        print(f"\n{term}  <{uri.rsplit('/', 1)[-1]}>")
        print(f"  ancestors:   {chain}")
        print(f"  descendants: {len(descendants)}"
              + (f" (e.g. {', '.join(d.label for d in descendants[:4])})" if descendants else ""))
    return 0


def cmd_sync_rdf(args) -> int:
    from polanyi.execution.knowledge_graph import Neo4jGraphStore

    ttl_path = Path(args.ttl)
    if not ttl_path.exists():
        print(f"No RDF at {ttl_path}. Run: polanyi rdf")
        return 1
    store = Neo4jGraphStore()
    if not store.is_available():
        print("Neo4j not reachable — check NEO4J_URI / NEO4J_PASSWORD")
        return 1
    try:
        stats = store.import_rdf(ttl_path.read_text(encoding="utf-8"))
    finally:
        store.close()
    print(f"n10s import: {stats['status']} — {stats['triples_loaded']} triples loaded")
    print("RDF view in Neo4j: MATCH (r:Resource) RETURN r.uri LIMIT 25")
    return 0


def cmd_materialize(args) -> int:
    from polanyi.execution.knowledge_graph import Neo4jGraphStore
    from polanyi.models import SemanticContext

    path = Path(args.context)
    if not path.exists():
        print(f"No context at {path}. Run: polanyi generate")
        return 1
    store = Neo4jGraphStore()
    if not store.is_available():
        print("Neo4j not reachable — check NEO4J_URI / NEO4J_PASSWORD")
        return 1
    ctx = SemanticContext.model_validate_json(path.read_text(encoding="utf-8"))
    try:
        stats = store.materialize(ctx)
    finally:
        store.close()
    print(
        f"Knowledge graph materialized: {stats['entities']} entities, "
        f"{stats['terms']} terms, {stats['relationships']} relationships"
    )
    print("Explore in Neo4j Browser: MATCH (n) RETURN n LIMIT 50")
    return 0


if __name__ == "__main__":
    sys.exit(main())
