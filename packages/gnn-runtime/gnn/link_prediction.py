"""Link prediction for FIBO ontology alignment suggestions.

Trains a simple GCN-based link predictor on the knowledge graph.
Given existing ALIGNED_TO edges as positive examples, predicts
likely new alignments between internal terms and FIBO ontology classes.

This is the core GNN use case from the research: ontology alignment
via graph structure + node features.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np

from .export import GraphSnapshot

log = logging.getLogger(__name__)


@dataclass
class LinkPrediction:
    """A single link prediction (source → target with score)."""

    source_name: str
    source_type: str
    target_name: str
    target_type: str
    score: float
    edge_type: str = "ALIGNED_TO"


@dataclass
class LinkPredictionResult:
    """Results from link prediction."""

    predictions: list[LinkPrediction]
    model_accuracy: float
    num_positive_train: int
    num_negative_train: int


def train_link_predictor(
    snapshot: GraphSnapshot,
    embedding_dim: int = 64,
    hidden_dim: int = 32,
    epochs: int = 20,
    negative_ratio: int = 3,
) -> LinkPredictionResult:
    """Train a GCN-based link predictor on existing edges.

    Uses node2vec embeddings as initial features, then trains a 2-layer GCN
    to predict edge existence. Existing ALIGNED_TO edges serve as positive
    training examples; random non-edges are negative examples.

    Args:
        snapshot: GraphSnapshot from the Neo4j export.
        embedding_dim: Initial embedding dimension.
        hidden_dim: GCN hidden dimension.
        epochs: Training epochs.
        negative_ratio: Negative samples per positive.

    Returns:
        LinkPredictionResult with accuracy and training metadata.
    """
    import torch
    import torch.nn.functional as F
    from torch_geometric.data import Data
    from torch_geometric.nn import GCNConv

    if snapshot.num_nodes == 0:
        return LinkPredictionResult(predictions=[], model_accuracy=0.0, num_positive_train=0, num_negative_train=0)

    # build edge index
    all_src, all_dst = [], []
    for edge_idx in snapshot.edge_index.values():
        all_src.extend(edge_idx[0].tolist())
        all_dst.extend(edge_idx[1].tolist())

    if not all_src:
        return LinkPredictionResult(predictions=[], model_accuracy=0.0, num_positive_train=0, num_negative_train=0)

    edge_index = torch.tensor([all_src, all_dst], dtype=torch.long)

    # one-hot features (node type + index encoding)
    features = torch.eye(snapshot.num_nodes, dtype=torch.float)

    # positive edges (all existing)
    pos_edge_idx = edge_index.t().tolist()
    pos_set = set(tuple(e) for e in pos_edge_idx)

    # negative sampling
    neg_src, neg_dst = [], []
    num_neg = len(pos_edge_idx) * negative_ratio
    rng = np.random.default_rng(42)
    attempts = 0
    while len(neg_src) < num_neg and attempts < num_neg * 10:
        s = int(rng.integers(0, snapshot.num_nodes))
        d = int(rng.integers(0, snapshot.num_nodes))
        if s != d and (s, d) not in pos_set and (d, s) not in pos_set:
            neg_src.append(s)
            neg_dst.append(d)
        attempts += 1

    # simple GCN for link prediction
    class LinkGCN(torch.nn.Module):
        def __init__(self, in_dim, hid_dim, out_dim):
            super().__init__()
            self.conv1 = GCNConv(in_dim, hid_dim)
            self.conv2 = GCNConv(hid_dim, out_dim)

        def forward(self, x, edge_index):
            x = F.relu(self.conv1(x, edge_index))
            x = self.conv2(x, edge_index)
            return x

    model = LinkGCN(snapshot.num_nodes, hidden_dim, embedding_dim)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)

    data = Data(x=features, edge_index=edge_index)

    # train: binary classification on edge existence
    model.train()
    for epoch in range(epochs):
        optimizer.zero_grad()
        z = model(data.x, data.edge_index)

        # positive score: dot product of connected pairs
        pos_score = (z[pos_edge_idx[:, 0]] * z[pos_edge_idx[:, 1]]).sum(dim=1).sigmoid()
        pos_loss = -torch.log(pos_score + 1e-15).mean()

        # negative score
        neg_idx = torch.tensor([neg_src[:len(pos_edge_idx)], neg_dst[:len(pos_edge_idx)]], dtype=torch.long)
        neg_score = (z[neg_idx[0]] * z[neg_idx[1]]).sum(dim=1).sigmoid()
        neg_loss = -torch.log(1 - neg_score + 1e-15).mean()

        loss = pos_loss + neg_loss
        loss.backward()
        optimizer.step()

        if (epoch + 1) % 5 == 0:
            acc = ((pos_score > 0.5).float().mean() + (neg_score < 0.5).float().mean()) / 2
            log.info("Link predictor epoch %d/%d — loss: %.4f, acc: %.4f", epoch + 1, epochs, loss.item(), acc.item())

    # evaluate
    model.eval()
    with torch.no_grad():
        z = model(data.x, data.edge_index)
        pos_score = (z[pos_edge_idx[:, 0]] * z[pos_edge_idx[:, 1]]).sum(dim=1).sigmoid()
        neg_score = (z[neg_src[:len(pos_edge_idx)]] * z[neg_dst[:len(pos_edge_idx)]]).sum(dim=1).sigmoid()
        acc = ((pos_score > 0.5).float().mean() + (neg_score < 0.5).float().mean()) / 2

    # predict new ALIGNED_TO links for Term nodes not yet aligned
    predictions = []
    term_indices = [i for i, t in enumerate(snapshot.node_types) if t == "Term"]
    entity_indices = [i for i, t in enumerate(snapshot.node_types) if t in ("Entity", "Term")]

    with torch.no_grad():
        z = model(data.x, data.edge_index)
        for t_idx in term_indices:
            scores = []
            for e_idx in entity_indices:
                if t_idx == e_idx or (t_idx, e_idx) in pos_set:
                    continue
                score = (z[t_idx] * z[e_idx]).sum().sigmoid().item()
                if score > 0.5:
                    scores.append((e_idx, score))
            scores.sort(key=lambda x: x[1], reverse=True)
            for e_idx, score in scores[:3]:
                predictions.append(
                    LinkPrediction(
                        source_name=snapshot.node_names[t_idx],
                        source_type=snapshot.node_types[t_idx],
                        target_name=snapshot.node_names[e_idx],
                        target_type=snapshot.node_types[e_idx],
                        score=score,
                    )
                )

    predictions.sort(key=lambda p: p.score, reverse=True)

    return LinkPredictionResult(
        predictions=predictions[:20],
        model_accuracy=float(acc),
        num_positive_train=len(pos_edge_idx),
        num_negative_train=len(neg_src[:len(pos_edge_idx)]),
    )
