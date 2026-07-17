"""Node2Vec embeddings for similarity search on the knowledge graph.

Trains a Node2Vec model on the heterogeneous graph, producing dense
vector representations for each node. These embeddings power:
  - Entity similarity (which terms cluster together)
  - Link suggestion (high cosine similarity = likely missing edge)
  - Drift detection (embedding distance shift over time)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np

from .export import GraphSnapshot, fetch_graph_snapshot

log = logging.getLogger(__name__)


@dataclass
class EmbeddingResult:
    """Node embeddings and metadata."""

    vectors: np.ndarray
    node_names: list[str]
    node_types: list[str]
    dimension: int


def train_node2vec(
    snapshot: GraphSnapshot,
    embedding_dim: int = 64,
    walk_length: int = 80,
    num_walks: int = 10,
    p: float = 1.0,
    q: float = 1.0,
    window_size: int = 10,
    epochs: int = 5,
) -> EmbeddingResult:
    """Train Node2Vec on a GraphSnapshot and return dense embeddings.

    Uses the flattened edge index (all edge types collapsed) for the random walk,
    since Node2Vec operates on homogeneous graphs. Edge type information is preserved
    in the output metadata.

    Args:
        snapshot: GraphSnapshot from the Neo4j export.
        embedding_dim: Dimension of output vectors.
        walk_length: Length of each random walk.
        num_walks: Number of walks per node.
        p: Return parameter (1 = BFS-like).
        q: In-out parameter (1 = DFS-like).
        window_size: Skip-gram window size.
        epochs: Training epochs.

    Returns:
        EmbeddingResult with vectors, names, and types.
    """
    import torch
    from torch_geometric.data import Data
    from torch_geometric.nn import Node2Vec

    if snapshot.num_nodes == 0:
        return EmbeddingResult(
            vectors=np.array([]),
            node_names=[],
            node_types=[],
            dimension=embedding_dim,
        )

    # build flattened edge index for the walk
    all_src, all_dst = [], []
    for edge_idx in snapshot.edge_index.values():
        all_src.extend(edge_idx[0].tolist())
        all_dst.extend(edge_idx[1].tolist())

    if not all_src:
        # no edges — return identity embeddings
        vectors = np.eye(snapshot.num_nodes, embedding_dim)[:, :embedding_dim]
        return EmbeddingResult(
            vectors=vectors,
            node_names=snapshot.node_names,
            node_types=snapshot.node_types,
            dimension=embedding_dim,
        )

    edge_index = torch.tensor([all_src, all_dst], dtype=torch.long)

    model = Node2Vec(
        edge_index,
        embedding_dim=embedding_dim,
        walk_length=walk_length,
        context_size=window_size,
        num_walks=num_walks,
        p=p,
        q=q,
        sparse=True,
    )

    loader = model.loader(batch_size=128, shuffle=True)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)

    model.train()
    for epoch in range(epochs):
        total_loss = 0.0
        for pos_rw, neg_rw in loader:
            optimizer.zero_grad()
            loss = model.loss(pos_rw, neg_rw)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
        log.info("Node2Vec epoch %d/%d — loss: %.4f", epoch + 1, epochs, total_loss / max(len(loader), 1))

    model.eval()
    with torch.no_grad():
        embeddings = model()

    vectors = embeddings.numpy()

    return EmbeddingResult(
        vectors=vectors,
        node_names=snapshot.node_names,
        node_types=snapshot.node_types,
        dimension=embedding_dim,
    )


def cosine_similarity_matrix(vectors: np.ndarray) -> np.ndarray:
    """Compute pairwise cosine similarity. Returns (N, N) matrix."""
    if vectors.size == 0:
        return np.array([])
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms = np.clip(norms, 1e-10, None)
    normalized = vectors / norms
    return normalized @ normalized.T


def find_similar_nodes(
    result: EmbeddingResult,
    node_index: int,
    top_k: int = 10,
    same_type_only: bool = False,
) -> list[tuple[int, str, str, float]]:
    """Find the most similar nodes to a given node by embedding cosine similarity.

    Args:
        result: EmbeddingResult from train_node2vec.
        node_index: Index of the query node.
        top_k: Number of results to return.
        same_type_only: If True, only return nodes of the same type.

    Returns:
        List of (index, name, type, similarity) tuples, sorted descending.
    """
    if result.vectors.size == 0 or node_index >= len(result.node_names):
        return []

    sims = cosine_similarity_matrix(result.vectors)
    query_type = result.node_types[node_index]

    scored = []
    for i in range(len(result.node_names)):
        if i == node_index:
            continue
        if same_type_only and result.node_types[i] != query_type:
            continue
        scored.append((i, result.node_names[i], result.node_types[i], float(sims[node_index, i])))

    scored.sort(key=lambda x: x[3], reverse=True)
    return scored[:top_k]
