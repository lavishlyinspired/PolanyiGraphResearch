"""Semantic (embedding-based) candidate retrieval for ontology alignment.

Lexical matching (`ontology.score_label`) only catches exact/inflected/substring
hits — it cannot find "Realized Pnl" -> "ProfitAndLoss" (no shared substring).
Embeddings catch these via meaning rather than spelling. This is entirely
optional and additive, mirroring the project's LLM-optional design: nothing here
runs unless a provider is configured or `sentence-transformers` happens to be
installed (`pip install polanyi-works[embeddings]`).

Two providers are supported behind one interface — local (no API key, no
per-call cost, heavier install) and API-based (light install, external
dependency + cost) — because both are legitimate deployment choices, not a
single "right" answer.
"""

from __future__ import annotations

import math
import os
from typing import Optional, Protocol

from polanyi.semantic.ontology import OntologyCandidate


class EmbeddingProvider(Protocol):
    def embed(self, texts: list[str]) -> list[list[float]]: ...


def cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


class LocalEmbeddingProvider:
    """sentence-transformers, loaded lazily — no API key, no network call at
    embed time (only the one-time model download on first use)."""

    def __init__(self, model_name: str = "all-MiniLM-L6-v2", model_factory=None):
        self.model_name = model_name
        self._model_factory = model_factory or self._default_factory
        self._model = None

    def _default_factory(self):
        from sentence_transformers import SentenceTransformer

        return SentenceTransformer(self.model_name)

    def embed(self, texts: list[str]) -> list[list[float]]:
        if self._model is None:
            self._model = self._model_factory()
        vectors = self._model.encode(list(texts))
        return [[float(x) for x in vector] for vector in vectors]


class ApiEmbeddingProvider:
    """OpenAI-compatible embeddings endpoint via the existing langchain-openai
    dependency — no local model, but adds a network dependency + per-call cost."""

    def __init__(self, model: str = "text-embedding-3-small", client_factory=None):
        self.model = model
        self._client_factory = client_factory or self._default_factory
        self._client = None

    def _default_factory(self):
        from langchain_openai import OpenAIEmbeddings

        return OpenAIEmbeddings(model=self.model)

    def embed(self, texts: list[str]) -> list[list[float]]:
        if self._client is None:
            self._client = self._client_factory()
        return self._client.embed_documents(list(texts))


def resolve_embedding_provider() -> Optional[EmbeddingProvider]:
    """Embeddings are opt-in, not auto-detected — unlike `resolve_llm` (which
    activates on an API key being *configured*), whether `sentence-transformers`
    happens to be *installed* is too weak a signal to activate real SPARQL +
    embedding work on every alignment request: a dev environment can have the
    package installed for experimentation without wanting it silently live.
    Explicit `POLANYI_EMBEDDING_PROVIDER=local|api`, else None."""
    provider = os.environ.get("POLANYI_EMBEDDING_PROVIDER", "").lower()
    if provider == "local":
        return LocalEmbeddingProvider()
    if provider == "api":
        return ApiEmbeddingProvider()
    return None


class EmbeddingOntologyIndex:
    """Semantic search over a fixed FIBO class corpus, plus the High-Confidence
    Bidirectional (HCB) check: a candidate is confirmed when it's also the best
    match, in reverse, among the whole glossary — a lightweight version of
    Barrasa's structural "triangle" check without a graph database."""

    def __init__(self, provider: EmbeddingProvider, classes: list[tuple[str, str, str]]):
        """`classes` is (uri, label, definition) for every FIBO class to search."""
        self._provider = provider
        self._classes = classes
        self._indexed: Optional[list[tuple[tuple[str, str, str], list[float]]]] = None

    def _ensure_index(self) -> list[tuple[tuple[str, str, str], list[float]]]:
        if self._indexed is None:
            labels = [label for _, label, _ in self._classes]
            vectors = self._provider.embed(labels) if labels else []
            self._indexed = list(zip(self._classes, vectors))
        return self._indexed

    def search(self, text: str, limit: int = 5) -> list[OntologyCandidate]:
        indexed = self._ensure_index()
        [query_vector] = self._provider.embed([text])
        scored = [
            ((uri, label, definition), cosine_similarity(query_vector, vector))
            for (uri, label, definition), vector in indexed
        ]
        scored.sort(key=lambda pair: pair[1], reverse=True)
        return [
            OntologyCandidate(
                uri=uri,
                label=label,
                definition=definition,
                score=round(max(0.0, min(1.0, score)), 2),
                method="embedding",
            )
            for (uri, label, definition), score in scored[:limit]
        ]

    def is_bidirectionally_confirmed(
        self, term: str, glossary_terms: list[str], candidate_label: str
    ) -> bool:
        """Assumes the forward direction (term -> candidate) is already known
        via `search()` — only checks whether the candidate's own best match
        among every glossary term is, in reverse, this same term."""
        vectors = self._provider.embed([candidate_label] + list(glossary_terms))
        candidate_vector, term_vectors = vectors[0], vectors[1:]
        best_term, best_score = None, float("-inf")
        for candidate_term, vector in zip(glossary_terms, term_vectors):
            score = cosine_similarity(candidate_vector, vector)
            if score > best_score:
                best_term, best_score = candidate_term, score
        return best_term == term
