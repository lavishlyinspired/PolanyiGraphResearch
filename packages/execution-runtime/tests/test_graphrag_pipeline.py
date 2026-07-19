"""GraphRAG pipeline: retrieval-augmented generation over the enterprise
knowledge graph's Term vector/fulltext indexes (materialized in Phase 2/S17).

HybridCypherRetriever and GraphRAG are neo4j_graphrag's real classes,
lazily imported inside graph_rag_query -- tests patch them at their origin
modules (neo4j_graphrag.retrievers / neo4j_graphrag.generation), the same
way this codebase already fakes Neo4jGraphStore at its origin module,
rather than injecting them via constructor parameters.
"""

from __future__ import annotations

from polanyi.execution.graphrag_pipeline import (
    _NO_CONTEXT_MESSAGE,
    _RETRIEVAL_QUERY,
    _EmbedderAdapter,
    graph_rag_query,
    resolve_graphrag_llm,
)


# ── _EmbedderAdapter ──────────────────────────────────────────────


def test_embedder_adapter_embeds_a_single_query_via_the_wrapped_provider():
    class FakeProvider:
        def embed(self, texts):
            assert texts == ["find me a bond"]
            return [[0.1, 0.2, 0.3]]

    adapter = _EmbedderAdapter(FakeProvider())
    assert adapter.embed_query("find me a bond") == [0.1, 0.2, 0.3]


# ── resolve_graphrag_llm ──────────────────────────────────────────


def test_resolve_graphrag_llm_returns_none_when_no_provider_is_configured(monkeypatch):
    import polanyi.kernel.llm as llm_module

    monkeypatch.setattr(llm_module, "resolve_openai_kwargs", lambda role: None)
    assert resolve_graphrag_llm() is None


def test_resolve_graphrag_llm_constructs_openai_llm_with_resolved_kwargs(monkeypatch):
    import polanyi.kernel.llm as llm_module
    import neo4j_graphrag.llm as graphrag_llm_module

    monkeypatch.setattr(
        llm_module,
        "resolve_openai_kwargs",
        lambda role: {"model": "gpt-4o", "api_key": "secret", "base_url": "https://example/v1"},
    )
    captured = {}

    class FakeOpenAILLM:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr(graphrag_llm_module, "OpenAILLM", FakeOpenAILLM)

    llm = resolve_graphrag_llm()
    assert isinstance(llm, FakeOpenAILLM)
    assert captured == {"model_name": "gpt-4o", "api_key": "secret", "base_url": "https://example/v1"}


# ── graph_rag_query ────────────────────────────────────────────────


class _FakeDriver:
    def __init__(self):
        self.closed = False

    def close(self):
        self.closed = True


def _configure_llm(monkeypatch, llm=None):
    import polanyi.execution.graphrag_pipeline as graphrag_module

    llm = llm if llm is not None else object()
    monkeypatch.setattr(graphrag_module, "resolve_graphrag_llm", lambda: llm)
    return llm


def _configure_driver(monkeypatch):
    import polanyi.execution.graphrag_pipeline as graphrag_module

    driver = _FakeDriver()
    monkeypatch.setattr(graphrag_module, "_default_driver", lambda: driver)
    return driver


class _FakeResult:
    def __init__(self, answer):
        self.answer = answer


def _configure_successful_rag(monkeypatch, answer, retriever_kwargs_out=None, search_kwargs_out=None):
    def fake_retriever(**kwargs):
        if retriever_kwargs_out is not None:
            retriever_kwargs_out.update(kwargs)
        return object()

    monkeypatch.setattr("neo4j_graphrag.retrievers.HybridCypherRetriever", fake_retriever)

    class FakeGraphRAG:
        def __init__(self, retriever, llm):
            self.retriever = retriever
            self.llm = llm

        def search(self, **kwargs):
            if search_kwargs_out is not None:
                search_kwargs_out.update(kwargs)
            return _FakeResult(answer)

    monkeypatch.setattr("neo4j_graphrag.generation.GraphRAG", FakeGraphRAG)


def test_graph_rag_query_degrades_honestly_when_no_llm_is_configured(monkeypatch):
    import polanyi.execution.graphrag_pipeline as graphrag_module

    monkeypatch.setattr(graphrag_module, "resolve_graphrag_llm", lambda: None)
    result = graph_rag_query("What is a Counterparty?")
    assert "llm" in result.lower()
    assert "configured" in result.lower()


def test_graph_rag_query_degrades_honestly_when_the_term_indexes_do_not_exist_yet(monkeypatch):
    _configure_llm(monkeypatch)
    driver = _configure_driver(monkeypatch)

    def boom(**kwargs):
        raise Exception("No index with name term_embedding found")

    monkeypatch.setattr("neo4j_graphrag.retrievers.HybridCypherRetriever", boom)

    result = graph_rag_query("What is a Counterparty?")

    assert "materializ" in result.lower()
    assert driver.closed is True


def test_graph_rag_query_returns_the_real_generated_answer(monkeypatch):
    _configure_llm(monkeypatch)
    driver = _configure_driver(monkeypatch)
    retriever_kwargs = {}
    search_kwargs = {}
    _configure_successful_rag(
        monkeypatch,
        "A Counterparty is the other party in a trade.",
        retriever_kwargs_out=retriever_kwargs,
        search_kwargs_out=search_kwargs,
    )

    result = graph_rag_query("What is a Counterparty?")

    assert result == "A Counterparty is the other party in a trade."
    assert retriever_kwargs["vector_index_name"] == "term_embedding"
    assert retriever_kwargs["fulltext_index_name"] == "term_fulltext"
    assert retriever_kwargs["retrieval_query"] == _RETRIEVAL_QUERY
    assert search_kwargs["query_text"] == "What is a Counterparty?"
    # return_context=False avoids the library's default-value deprecation
    # warning; response_fallback is what keeps an empty-context match from
    # being silently handed to the LLM to fabricate an answer around.
    assert search_kwargs["return_context"] is False
    assert search_kwargs["response_fallback"] == _NO_CONTEXT_MESSAGE
    assert driver.closed is True


def test_graph_rag_query_surfaces_generation_errors_honestly_not_fabricated(monkeypatch):
    _configure_llm(monkeypatch)
    driver = _configure_driver(monkeypatch)
    monkeypatch.setattr("neo4j_graphrag.retrievers.HybridCypherRetriever", lambda **kwargs: object())

    class FakeGraphRAG:
        def __init__(self, retriever, llm):
            pass

        def search(self, **kwargs):
            raise RuntimeError("LLM API timeout")

    monkeypatch.setattr("neo4j_graphrag.generation.GraphRAG", FakeGraphRAG)

    result = graph_rag_query("What is a Counterparty?")

    assert "Error" in result
    assert "LLM API timeout" in result
    assert driver.closed is True


def test_graph_rag_query_passes_no_embedder_when_no_embedding_provider_is_configured(monkeypatch):
    import polanyi.semantic.embeddings as embeddings_module

    _configure_llm(monkeypatch)
    _configure_driver(monkeypatch)
    monkeypatch.setattr(embeddings_module, "resolve_embedding_provider", lambda: None)
    retriever_kwargs = {}
    _configure_successful_rag(monkeypatch, "answer", retriever_kwargs_out=retriever_kwargs)

    graph_rag_query("question")

    assert retriever_kwargs["embedder"] is None


def test_graph_rag_query_wraps_the_configured_embedding_provider_for_the_retriever(monkeypatch):
    import polanyi.semantic.embeddings as embeddings_module

    _configure_llm(monkeypatch)
    _configure_driver(monkeypatch)

    class FakeProvider:
        def embed(self, texts):
            return [[0.1, 0.2]]

    monkeypatch.setattr(embeddings_module, "resolve_embedding_provider", lambda: FakeProvider())
    retriever_kwargs = {}
    _configure_successful_rag(monkeypatch, "answer", retriever_kwargs_out=retriever_kwargs)

    graph_rag_query("question")

    assert isinstance(retriever_kwargs["embedder"], _EmbedderAdapter)
