"""Capability Runtime: planners request capabilities, not implementations.

A provider advertises which capability it fulfils (`ExecuteSQL`,
`DiscoverMetadata`, `SearchOntology`, ...) and how it is implemented —
a Python function, a LangChain tool, an MCP server, or an API. The registry
resolves a capability to the best provider, so new backends (Neo4j, GraphDB,
Databricks skills) plug in without touching planner or agent code.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Literal, Optional

ProviderKind = Literal["function", "tool", "mcp", "api"]


class CapabilityNotFound(LookupError):
    """No registered provider fulfils the requested capability."""


@dataclass(frozen=True)
class CapabilityProvider:
    name: str
    capability: str
    kind: ProviderKind
    description: str
    handler: Any
    metadata: dict[str, Any] = field(default_factory=dict)


class CapabilityRegistry:
    def __init__(self) -> None:
        self._providers: list[CapabilityProvider] = []

    def register(self, provider: CapabilityProvider) -> None:
        self._providers.append(provider)

    def providers(self, capability: str) -> list[CapabilityProvider]:
        return [p for p in self._providers if p.capability == capability]

    def resolve(self, capability: str, prefer: Optional[str] = None) -> CapabilityProvider:
        candidates = self.providers(capability)
        if not candidates:
            raise CapabilityNotFound(
                f"No provider registered for capability '{capability}'. "
                f"Available: {', '.join(self.capabilities()) or 'none'}"
            )
        if prefer is not None:
            for candidate in candidates:
                if candidate.name == prefer:
                    return candidate
        return candidates[0]

    def capabilities(self) -> list[str]:
        return sorted({p.capability for p in self._providers})

    def catalog(self) -> list[dict[str, Any]]:
        """Serializable listing for APIs and UIs — never exposes handlers."""
        return [
            {
                "capability": p.capability,
                "name": p.name,
                "kind": p.kind,
                "description": p.description,
                "metadata": p.metadata,
            }
            for p in self._providers
        ]

    def agent_tools(self) -> list[Any]:
        """LangChain tools an agent can call directly (kind == 'tool')."""
        return [p.handler for p in self._providers if p.kind == "tool"]


def default_registry(
    db_uri: str,
    rules: list,
    on_event: Optional[Callable[[Any], None]] = None,
    on_validation: Optional[Callable[[str, Any], None]] = None,
) -> CapabilityRegistry:
    """The built-in providers for a single-database Polanyi Works deployment."""
    from polanyi.agents.semantic_agent import build_sql_tools
    from polanyi.semantic.introspect import introspect
    from polanyi.execution.validate import validate_sql

    registry = CapabilityRegistry()
    dialect = db_uri.split(":", 1)[0]

    registry.register(
        CapabilityProvider(
            name=f"{dialect}-introspector",
            capability="DiscoverMetadata",
            kind="function",
            description="Read tables, columns, and foreign keys from the connected database",
            handler=lambda: introspect(db_uri),
        )
    )
    registry.register(
        CapabilityProvider(
            name="symbolic-sql-validator",
            capability="ValidateSQL",
            kind="function",
            description="Check SQL against declared business rules (deterministic, no LLM)",
            handler=lambda sql: validate_sql(sql, rules),
        )
    )

    tool_capabilities = {
        "sql_db_list_tables": ("ListTables", "List tables in the connected database"),
        "sql_db_schema": ("InspectSchema", "Show CREATE TABLE + sample rows for tables"),
        "sql_db_query": (
            "ExecuteSQL",
            "Run read-only SQL; every statement passes the symbolic rule guard first",
        ),
    }
    for sql_tool in build_sql_tools(db_uri, rules, on_event, on_validation):
        capability, description = tool_capabilities[sql_tool.name]
        registry.register(
            CapabilityProvider(
                name=f"{dialect}-{sql_tool.name}",
                capability=capability,
                kind="tool",
                description=description,
                handler=sql_tool,
                metadata={"guarded": capability == "ExecuteSQL"},
            )
        )

    _register_optional_backends(registry)

    from polanyi.kernel.skills import load_skills

    load_skills(registry)
    return registry


def _describe_graph_schema(store: Any) -> str:
    """Real, live node-label and relationship-type list for a tool description —
    not a hardcoded guess that goes stale as the graph schema evolves."""
    try:
        labels = [r["label"] for r in store.run_cypher("CALL db.labels() YIELD label RETURN label")]
        rel_types = [
            r["relationshipType"]
            for r in store.run_cypher("CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType")
        ]
        return f"Node labels: {', '.join(sorted(labels))}. Relationship types: {', '.join(sorted(rel_types))}."
    except Exception:  # noqa: BLE001 — schema introspection is best-effort
        return "Schema unavailable."
    finally:
        store.close()


def _register_optional_backends(registry: CapabilityRegistry) -> None:
    from polanyi.execution.knowledge_graph import neo4j_configured
    from polanyi.semantic.ontology import graphdb_configured

    if graphdb_configured():
        from langchain.tools import tool as make_tool

        from polanyi.semantic.ontology import GraphDBOntologyStore

        store = GraphDBOntologyStore()

        @make_tool
        def search_ontology(term: str) -> str:
            """Search FIBO ontology classes in GraphDB by business term.
            Returns matching ontology classes with labels, definitions, and scores."""
            return str(store.search_classes(term))

        @make_tool
        def expand_ontology(uri: str) -> str:
            """Expand an ontology class URI to all its transitive subclasses
            via rdfs:subClassOf* (deterministic, no LLM)."""
            return str(store.expand_subclasses(uri))

        registry.register(
            CapabilityProvider(
                name="graphdb-fibo-search",
                capability="SearchOntology",
                kind="tool",
                description="Search ontology classes (FIBO) in GraphDB by business term",
                handler=search_ontology,
                metadata={"repository": store.repository},
            )
        )
        registry.register(
            CapabilityProvider(
                name="graphdb-hierarchy-expansion",
                capability="ExpandOntology",
                kind="tool",
                description=(
                    "Expand an ontology class to all transitive subclasses "
                    "(deterministic rdfs:subClassOf* traversal)"
                ),
                handler=expand_ontology,
                metadata={"repository": store.repository},
            )
        )

        from polanyi.semantic.owl import java_available, reason_about_class

        registry.register(
            CapabilityProvider(
                name="owlready2-reasoner",
                capability="ReasonOWL",
                kind="function",
                description=(
                    "Load a class's subclass neighborhood from GraphDB into "
                    "Owlready2: ancestors, descendants, and HermiT consistency "
                    "when a Java runtime is present"
                ),
                handler=reason_about_class,
                metadata={"hermit": java_available()},
            )
        )

    if neo4j_configured():
        from langchain.tools import tool

        from polanyi.execution.knowledge_graph import Neo4jGraphStore, guard_cypher

        @tool
        def query_knowledge_graph(cypher: str) -> str:
            """Run read-only Cypher against the enterprise knowledge graph.
            Write operations are rejected."""
            violation = guard_cypher(cypher)
            if violation:
                return f"QUERY BLOCKED: {violation}"
            store = Neo4jGraphStore()
            try:
                count = store.run_cypher("MATCH (n) RETURN count(n) AS c")[0]["c"]
                if count == 0:
                    return (
                        "The knowledge graph has not been materialized yet — no "
                        "nodes exist. Materialize it first, then query again."
                    )
                rows = store.run_cypher(cypher)
            except Exception as exc:  # noqa: BLE001 — surface driver errors to the model
                return f"Error: {exc}"
            finally:
                store.close()
            return str(rows[:50])

        query_knowledge_graph.description = (
            f"Run read-only Cypher against the enterprise knowledge graph. "
            f"{_describe_graph_schema(Neo4jGraphStore())} Write operations are rejected."
        )

        registry.register(
            CapabilityProvider(
                name="neo4j-query_knowledge_graph",
                capability="RunCypher",
                kind="tool",
                description="Read-only Cypher over the materialized enterprise knowledge graph",
                handler=query_knowledge_graph,
                metadata={"guarded": True},
            )
        )
