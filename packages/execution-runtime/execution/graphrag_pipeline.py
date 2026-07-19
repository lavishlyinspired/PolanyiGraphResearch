"""GraphRAG: retrieval-augmented generation over the enterprise knowledge
graph's Term vector/fulltext indexes (materialized in Phase 2/S17), grounded
by real relationship traversal (DESCRIBES/MENTIONS/REFERS_TO) rather than a
flat vector-only lookup.

Registered directly in capabilities.py — not a platform/skills/ plugin
entry (this is a core capability, not an optional skill).
"""

from __future__ import annotations

import os
from typing import Any, Optional

_RETRIEVAL_QUERY = (
    "WITH node AS term, score "
    "OPTIONAL MATCH (term)-[:DESCRIBES]->(entity:Entity) "
    "OPTIONAL MATCH (doc:Document)-[:MENTIONS]->(:Mention)-[:REFERS_TO]->(term) "
    "RETURN term.term AS term, term.definition AS definition, "
    "collect(DISTINCT entity.name) AS related_entities, "
    "collect(DISTINCT doc.title) AS source_documents, score "
    "ORDER BY score DESC"
)

_NO_LLM_MESSAGE = (
    "GraphRAG needs an LLM to generate answers, and none is configured. Set "
    "NVIDIA_API_KEY, OPENAI_API_KEY, or DATABRICKS_TOKEN+DATABRICKS_SERVING_ENDPOINT."
)

_NO_CONTEXT_MESSAGE = "No relevant information found in the knowledge graph for this question."


class _EmbedderAdapter:
    """Wraps this project's EmbeddingProvider (embed(list[str]) -> list[list[float]])
    to satisfy neo4j_graphrag's Embedder interface (embed_query(str) -> list[float])."""

    def __init__(self, provider: Any) -> None:
        self._provider = provider

    def embed_query(self, text: str) -> list[float]:
        return self._provider.embed([text])[0]


def resolve_graphrag_llm(role: str = "agent") -> Optional[Any]:
    """A neo4j_graphrag LLMInterface bound to the same provider resolve_llm()
    would pick — reuses resolve_openai_kwargs so provider defaults (model
    names, NVIDIA/Databricks base URLs) live in one place."""
    from polanyi.kernel.llm import resolve_openai_kwargs

    kwargs = resolve_openai_kwargs(role)
    if kwargs is None:
        return None

    from neo4j_graphrag.llm import OpenAILLM

    kwargs = dict(kwargs)
    model_name = kwargs.pop("model")
    return OpenAILLM(model_name=model_name, **kwargs)


def _default_driver() -> Any:
    """Bounded connection/retry timeouts — an unreachable/misconfigured
    NEO4J_URI must fail fast, not hang for ~30s in the driver's default
    managed-transaction retry loop (the same hang GDS client construction
    hit in S18)."""
    from neo4j import GraphDatabase

    return GraphDatabase.driver(
        os.environ.get("NEO4J_URI", "neo4j://127.0.0.1:7687"),
        auth=(
            os.environ.get("NEO4J_USERNAME", "neo4j"),
            os.environ.get("NEO4J_PASSWORD", ""),
        ),
        connection_timeout=2.0,
        max_transaction_retry_time=2.0,
    )


def graph_rag_query(question: str) -> str:
    """Answer a question grounded in the real knowledge graph. Degrades
    honestly (never a fabricated answer) when no LLM is configured or the
    Term vector/fulltext indexes haven't been materialized yet."""
    llm = resolve_graphrag_llm()
    if llm is None:
        return _NO_LLM_MESSAGE

    driver = _default_driver()
    try:
        from polanyi.semantic.embeddings import resolve_embedding_provider

        provider = resolve_embedding_provider()
        embedder = _EmbedderAdapter(provider) if provider is not None else None

        from neo4j_graphrag.retrievers import HybridCypherRetriever

        try:
            retriever = HybridCypherRetriever(
                driver=driver,
                vector_index_name="term_embedding",
                fulltext_index_name="term_fulltext",
                retrieval_query=_RETRIEVAL_QUERY,
                embedder=embedder,
            )
        except Exception as exc:  # noqa: BLE001 — indexes may not exist yet (Phase 2 not run)
            return (
                "GraphRAG isn't available yet — the knowledge graph's term "
                f"indexes aren't set up. Materialize the graph first. Detail: {exc}"
            )

        from neo4j_graphrag.generation import GraphRAG

        rag = GraphRAG(retriever=retriever, llm=llm)
        try:
            result = rag.search(
                query_text=question,
                return_context=False,
                response_fallback=_NO_CONTEXT_MESSAGE,
            )
        except Exception as exc:  # noqa: BLE001 — surface retrieval/generation errors honestly
            return f"Error: {exc}"
        return result.answer
    finally:
        driver.close()
