import math

import pytest

from polanyi.semantic.embeddings import (
    ApiEmbeddingProvider,
    EmbeddingOntologyIndex,
    LocalEmbeddingProvider,
    cosine_similarity,
    resolve_embedding_provider,
)


def test_cosine_similarity_of_identical_vectors_is_one():
    assert cosine_similarity([1.0, 2.0, 3.0], [1.0, 2.0, 3.0]) == pytest.approx(1.0)


def test_cosine_similarity_of_orthogonal_vectors_is_zero():
    assert cosine_similarity([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)


def test_cosine_similarity_of_opposite_vectors_is_negative_one():
    assert cosine_similarity([1.0, 0.0], [-1.0, 0.0]) == pytest.approx(-1.0)


def test_cosine_similarity_is_scale_invariant():
    """Same direction, different magnitude -> still 1.0 (real embeddings from
    different models/normalizations shouldn't be penalized for magnitude)."""
    assert cosine_similarity([1.0, 1.0], [5.0, 5.0]) == pytest.approx(1.0)


def test_cosine_similarity_of_a_zero_vector_is_zero_not_a_crash():
    assert cosine_similarity([0.0, 0.0], [1.0, 2.0]) == 0.0


class FakeModel:
    """Deterministic 'model' — encodes each text as a fixed vector from a lookup,
    so provider tests never need a real ML model or network access."""

    def __init__(self, vectors_by_text):
        self.vectors_by_text = vectors_by_text
        self.encoded = []

    def encode(self, texts):
        self.encoded.append(list(texts))
        return [self.vectors_by_text[t] for t in texts]


def test_local_embedding_provider_encodes_texts_via_the_injected_model():
    model = FakeModel({"trade": [1.0, 0.0], "settlement": [0.0, 1.0]})
    provider = LocalEmbeddingProvider(model_factory=lambda: model)
    vectors = provider.embed(["trade", "settlement"])
    assert vectors == [[1.0, 0.0], [0.0, 1.0]]
    assert model.encoded == [["trade", "settlement"]]


def test_local_embedding_provider_loads_the_model_only_once():
    calls = []

    def factory():
        calls.append(1)
        return FakeModel({"x": [1.0]})

    provider = LocalEmbeddingProvider(model_factory=factory)
    provider.embed(["x"])
    provider.embed(["x"])
    assert len(calls) == 1


class FakeEmbeddingsClient:
    def __init__(self, vectors_by_text):
        self.vectors_by_text = vectors_by_text

    def embed_documents(self, texts):
        return [self.vectors_by_text[t] for t in texts]


def test_api_embedding_provider_encodes_texts_via_the_injected_client():
    client = FakeEmbeddingsClient({"trade": [0.5, 0.5]})
    provider = ApiEmbeddingProvider(client_factory=lambda: client)
    assert provider.embed(["trade"]) == [[0.5, 0.5]]


def test_resolve_embedding_provider_returns_none_by_default(monkeypatch):
    """Embeddings are opt-in: with no POLANYI_EMBEDDING_PROVIDER set, this must
    return None regardless of whether sentence-transformers happens to be
    installed in the current environment -- installed is not the same as
    wanted, and an unconfigured deployment must not silently start doing real
    SPARQL + embedding work on every alignment request."""
    monkeypatch.delenv("POLANYI_EMBEDDING_PROVIDER", raising=False)
    assert resolve_embedding_provider() is None


def test_resolve_embedding_provider_returns_none_when_explicitly_disabled(monkeypatch):
    monkeypatch.setenv("POLANYI_EMBEDDING_PROVIDER", "none")
    assert resolve_embedding_provider() is None


def test_resolve_embedding_provider_returns_local_when_explicitly_requested(monkeypatch):
    monkeypatch.setenv("POLANYI_EMBEDDING_PROVIDER", "local")
    provider = resolve_embedding_provider()
    assert isinstance(provider, LocalEmbeddingProvider)


def test_resolve_embedding_provider_returns_api_when_explicitly_requested(monkeypatch):
    monkeypatch.setenv("POLANYI_EMBEDDING_PROVIDER", "api")
    provider = resolve_embedding_provider()
    assert isinstance(provider, ApiEmbeddingProvider)


# ── EmbeddingOntologyIndex ────────────────────────────────────────


class FakeProvider:
    """Deterministic embedding provider for index tests — same lookup-table
    pattern as FakeModel, one level up the stack."""

    def __init__(self, vectors_by_text):
        self.vectors_by_text = vectors_by_text

    def embed(self, texts):
        return [self.vectors_by_text[t] for t in texts]


FIBO_CLASSES = [
    ("urn:fibo:ProfitAndLoss", "ProfitAndLoss", "Net gain or loss from operations."),
    ("urn:fibo:Currency", "Currency", "A medium of exchange."),
]


def test_embedding_index_ranks_candidates_by_cosine_similarity():
    provider = FakeProvider(
        {
            "ProfitAndLoss": [1.0, 0.0],
            "Currency": [0.0, 1.0],
            "Realized Pnl": [0.9, 0.1],
        }
    )
    index = EmbeddingOntologyIndex(provider, FIBO_CLASSES)
    results = index.search("Realized Pnl", limit=5)
    assert results[0].uri == "urn:fibo:ProfitAndLoss"
    assert results[0].method == "embedding"
    assert results[0].score > results[1].score


def test_embedding_index_clamps_negative_similarity_to_zero():
    """OntologyCandidate.score requires >=0 — cosine can go negative for
    genuinely opposite vectors, so it must be clamped, not passed through raw."""
    provider = FakeProvider(
        {
            "ProfitAndLoss": [1.0, 0.0],
            "Currency": [0.0, 1.0],
            "Opposite Term": [-1.0, 0.0],
        }
    )
    index = EmbeddingOntologyIndex(provider, FIBO_CLASSES)
    results = index.search("Opposite Term", limit=5)
    matching = next(r for r in results if r.uri == "urn:fibo:ProfitAndLoss")
    assert matching.score == 0.0


def test_embedding_index_only_embeds_fibo_classes_once():
    calls = []

    class CountingProvider:
        def embed(self, texts):
            calls.append(list(texts))
            return [[1.0, 0.0] for _ in texts]

    index = EmbeddingOntologyIndex(CountingProvider(), FIBO_CLASSES)
    index.search("term one")
    index.search("term two")
    # One batch call to embed the FIBO corpus, plus one per search term.
    assert len(calls) == 3
    assert calls[0] == ["ProfitAndLoss", "Currency"]


def test_hcb_confirms_a_mutual_best_match():
    provider = FakeProvider(
        {
            "ProfitAndLoss": [1.0, 0.0],
            "Currency": [0.0, 1.0],
            "Realized Pnl": [0.9, 0.1],
            "Notional Amount": [0.0, 0.9],
        }
    )
    index = EmbeddingOntologyIndex(provider, FIBO_CLASSES)
    confirmed = index.is_bidirectionally_confirmed(
        term="Realized Pnl",
        glossary_terms=["Realized Pnl", "Notional Amount"],
        candidate_label="ProfitAndLoss",
    )
    assert confirmed is True


def test_hcb_rejects_a_one_sided_match():
    """The candidate's own best match among glossary terms points to a
    *different* term -- not mutual, so not confirmed."""
    provider = FakeProvider(
        {
            "ProfitAndLoss": [1.0, 0.0],
            "Currency": [0.0, 1.0],
            "Realized Pnl": [0.6, 0.4],
            "Booked Profit": [0.95, 0.05],
        }
    )
    index = EmbeddingOntologyIndex(provider, FIBO_CLASSES)
    confirmed = index.is_bidirectionally_confirmed(
        term="Realized Pnl",
        glossary_terms=["Realized Pnl", "Booked Profit"],
        candidate_label="ProfitAndLoss",
    )
    assert confirmed is False
