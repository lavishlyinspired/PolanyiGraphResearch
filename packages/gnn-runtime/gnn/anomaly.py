"""Anomaly and drift detection on the knowledge graph.

Uses embedding-based methods to detect:
  1. Structural anomalies — nodes with unusual connectivity patterns
  2. Semantic drift — entities whose embedding distance from their glossary
     term has increased since the last baseline
  3. Community detection — identify clusters of related terms that may need
     governance review
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import Enum

import numpy as np

from .export import GraphSnapshot

log = logging.getLogger(__name__)


class Severity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


@dataclass
class DriftAlert:
    """A semantic drift detection result."""

    entity_name: str
    term_name: str
    distance: float
    severity: Severity
    description: str


@dataclass
class CommunityInfo:
    """A detected community (cluster) in the graph."""

    label: str
    member_names: list[str]
    member_types: list[str]
    size: int
    coherence: float


@dataclass
class AnomalyResult:
    """Full anomaly/drift analysis result."""

    drift_alerts: list[DriftAlert]
    communities: list[CommunityInfo]
    isolated_nodes: list[tuple[str, str]]
    governance_gaps: list[str]


def detect_drift(
    snapshot: GraphSnapshot,
    vectors: np.ndarray,
    baseline_vectors: np.ndarray | None = None,
    drift_threshold: float = 0.3,
) -> list[DriftAlert]:
    """Detect semantic drift by comparing current embeddings to a baseline.

    If no baseline is provided, uses structural anomaly (degree-based) as
    a proxy for drift.

    Args:
        snapshot: Current graph snapshot.
        vectors: Current node embeddings.
        baseline_vectors: Previous embedding baseline (same shape).
        drift_threshold: Cosine distance threshold for drift alert.

    Returns:
        List of DriftAlert objects sorted by severity.
    """
    alerts = []

    if baseline_vectors is not None and baseline_vectors.shape == vectors.shape:
        # embedding-based drift
        norms = np.linalg.norm(vectors, axis=1, keepdims=True)
        norms = np.clip(norms, 1e-10, None)
        normed = vectors / norms

        bnorms = np.linalg.norm(baseline_vectors, axis=1, keepdims=True)
        bnorms = np.clip(bnorms, 1e-10, None)
        bnromed = baseline_vectors / bnorms

        for i in range(len(snapshot.node_names)):
            dist = 1.0 - float(normed[i] @ bnromed[i])
            if dist > drift_threshold:
                severity = Severity.HIGH if dist > drift_threshold * 2 else Severity.MEDIUM
                alerts.append(
                    DriftAlert(
                        entity_name=snapshot.node_names[i],
                        term_name=snapshot.node_names[i],
                        distance=dist,
                        severity=severity,
                        description=f"Embedding shifted by {dist:.3f} from baseline",
                    )
                )

    # structural anomalies: nodes with unusual degree
    degree = np.zeros(snapshot.num_nodes)
    for edge_idx in snapshot.edge_index.values():
        for s, t in zip(edge_idx[0], edge_idx[1]):
            if s < len(degree) and t < len(degree):
                degree[s] += 1
                degree[t] += 1

    mean_deg = degree.mean() if len(degree) > 0 else 0
    std_deg = degree.std() if len(degree) > 0 else 1
    if std_deg == 0:
        std_deg = 1.0

    for i in range(len(snapshot.node_names)):
        z_score = (degree[i] - mean_deg) / std_deg
        if z_score > 2.5:
            alerts.append(
                DriftAlert(
                    entity_name=snapshot.node_names[i],
                    term_name=snapshot.node_names[i],
                    distance=float(z_score),
                    severity=Severity.LOW,
                    description=f"Structural anomaly: degree {int(degree[i])} (z={z_score:.2f})",
                )
            )

    alerts.sort(key=lambda a: a.distance, reverse=True)
    return alerts


def detect_communities(
    snapshot: GraphSnapshot,
    vectors: np.ndarray,
    n_clusters: int = 5,
) -> list[CommunityInfo]:
    """Detect communities using spectral clustering on the embedding space.

    Args:
        snapshot: Graph snapshot.
        vectors: Node embeddings.
        n_clusters: Number of clusters to detect.

    Returns:
        List of CommunityInfo objects.
    """
    from sklearn.cluster import KMeans

    if vectors.size == 0 or len(snapshot.node_names) < n_clusters:
        return []

    kmeans = KMeans(n_clusters=min(n_clusters, len(snapshot.node_names)), random_state=42, n_init=10)
    labels = kmeans.fit_predict(vectors)

    communities = []
    for cluster_id in range(kmeans.n_clusters):
        mask = labels == cluster_id
        member_names = [snapshot.node_names[i] for i in range(len(mask)) if mask[i]]
        member_types = [snapshot.node_types[i] for i in range(len(mask)) if mask[i]]

        if not member_names:
            continue

        coherence = float(1.0 - kmeans.inertia_ / (len(snapshot.node_names) * vectors.shape[1]))
        coherence = max(0.0, min(1.0, coherence))

        # label = most common type in the cluster
        from collections import Counter
        type_counts = Counter(member_types)
        label = type_counts.most_common(1)[0][0]

        communities.append(
            CommunityInfo(
                label=f"Community {cluster_id}: {label}",
                member_names=member_names,
                member_types=member_types,
                size=len(member_names),
                coherence=coherence,
            )
        )

    communities.sort(key=lambda c: c.size, reverse=True)
    return communities


def find_isolated_nodes(snapshot: GraphSnapshot) -> list[tuple[str, str]]:
    """Find nodes with no edges (isolated vertices).

    Returns:
        List of (node_name, node_type) tuples.
    """
    connected = set()
    for edge_idx in snapshot.edge_index.values():
        for s, t in zip(edge_idx[0], edge_idx[1]):
            connected.add(int(s))
            connected.add(int(t))

    return [
        (snapshot.node_names[i], snapshot.node_types[i])
        for i in range(len(snapshot.node_names))
        if i not in connected
    ]


def find_governance_gaps(snapshot: GraphSnapshot) -> list[str]:
    """Identify governance gaps: terms without ontology URIs, entities without definitions.

    Returns:
        List of human-readable gap descriptions.
    """
    gaps = []
    for i, ntype in enumerate(snapshot.node_types):
        if ntype == "Term":
            # check for missing ontology alignment
            edges = []
            for key, edge_idx in snapshot.edge_index.items():
                if "Term" in key and "ALIGNED_TO" in key:
                    for s, t in zip(edge_idx[0], edge_idx[1]):
                        if s == i or t == i:
                            edges.append(key)
            if not edges:
                gaps.append(f"Term '{snapshot.node_names[i]}' has no ALIGNED_TO edge to FIBO")
        elif ntype == "Entity":
            # check for missing DESCRIBES edge
            described = False
            for key, edge_idx in snapshot.edge_index.items():
                if "DESCRIBES" in key:
                    for s, t in zip(edge_idx[0], edge_idx[1]):
                        if t == i:
                            described = True
            if not described:
                gaps.append(f"Entity '{snapshot.node_names[i]}' has no glossary term (DESCRIBES)")

    return gaps
