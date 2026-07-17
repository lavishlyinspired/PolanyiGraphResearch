"""Insights aggregation — combines embeddings, link predictions, and anomaly
detection into a unified Insights API response.

This is the backend that powers the "Insights" page in Studio:
  - Link suggestions (from link_prediction)
  - Drift alerts (from anomaly detection)
  - Communities (from clustering)
  - Governance gaps (from anomaly detection)
  - Grounding quality score (aggregate metric)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np

from .anomaly import (
    AnomalyResult,
    CommunityInfo,
    DriftAlert,
    Severity,
    detect_communities,
    detect_drift,
    find_governance_gaps,
    find_isolated_nodes,
)
from .embeddings import EmbeddingResult, train_node2vec
from .export import GraphSnapshot, fetch_graph_snapshot
from .link_prediction import LinkPrediction, LinkPredictionResult, train_link_predictor

log = logging.getLogger(__name__)


@dataclass
class InsightsResponse:
    """Unified insights response for the Studio API."""

    grounding_score: float = 0.0
    link_suggestions: list[LinkPrediction] = field(default_factory=list)
    drift_alerts: list[DriftAlert] = field(default_factory=list)
    communities: list[CommunityInfo] = field(default_factory=list)
    governance_gaps: list[str] = field(default_factory=list)
    isolated_nodes: list[tuple[str, str]] = field(default_factory=list)
    summary: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        """Serialize for JSON response."""
        return {
            "grounding_score": round(self.grounding_score, 3),
            "link_suggestions": [
                {
                    "source": p.source_name,
                    "source_type": p.source_type,
                    "target": p.target_name,
                    "target_type": p.target_type,
                    "score": round(p.score, 3),
                    "edge_type": p.edge_type,
                }
                for p in self.link_suggestions
            ],
            "drift_alerts": [
                {
                    "entity": a.entity_name,
                    "term": a.term_name,
                    "distance": round(a.distance, 3),
                    "severity": a.severity.value,
                    "description": a.description,
                }
                for a in self.drift_alerts
            ],
            "communities": [
                {
                    "label": c.label,
                    "members": c.member_names[:10],
                    "size": c.size,
                    "coherence": round(c.coherence, 3),
                }
                for c in self.communities
            ],
            "governance_gaps": self.governance_gaps,
            "isolated_nodes": [{"name": n, "type": t} for n, t in self.isolated_nodes],
            "summary": self.summary,
        }


def compute_grounding_score(
    num_terms_aligned: int,
    num_terms_total: int,
    num_entities_described: int,
    num_entities_total: int,
    drift_count: int,
    total_nodes: int,
) -> float:
    """Compute a 0-1 grounding quality score.

    Factors:
      - Ontology alignment ratio (40% weight)
      - Glossary coverage ratio (30% weight)
      - Drift penalty (20% weight)
      - Connectivity bonus (10% weight)
    """
    if total_nodes == 0:
        return 0.0

    alignment_ratio = num_terms_aligned / max(num_terms_total, 1)
    coverage_ratio = num_entities_described / max(num_entities_total, 1)
    drift_penalty = max(0.0, 1.0 - (drift_count / max(total_nodes, 1)))
    connectivity = 1.0 if num_terms_total + num_entities_total > 0 else 0.0

    score = (
        0.4 * alignment_ratio
        + 0.3 * coverage_ratio
        + 0.2 * drift_penalty
        + 0.1 * connectivity
    )
    return max(0.0, min(1.0, score))


def generate_insights(
    driver,
    baseline_embeddings: np.ndarray | None = None,
    num_communities: int = 5,
) -> InsightsResponse:
    """Run the full insights pipeline on a Neo4j connection.

    Args:
        driver: neo4j.GraphDatabase.driver instance.
        baseline_embeddings: Optional previous embedding baseline for drift detection.
        num_communities: Number of communities to detect.

    Returns:
        InsightsResponse with all computed insights.
    """
    snapshot = fetch_graph_snapshot(driver)
    log.info("Graph snapshot: %d nodes, %d edge types", snapshot.num_nodes, len(snapshot.edge_index))

    # embeddings
    emb_result = train_node2vec(snapshot)
    log.info("Node2Vec embeddings: shape=%s", emb_result.vectors.shape)

    # link predictions
    link_result = train_link_predictor(snapshot)

    # drift detection
    drift_alerts = detect_drift(snapshot, emb_result.vectors, baseline_embeddings)

    # communities
    communities = detect_communities(snapshot, emb_result.vectors, num_communities)

    # governance gaps
    governance_gaps = find_governance_gaps(snapshot)

    # isolated nodes
    isolated = find_isolated_nodes(snapshot)

    # grounding score
    terms_aligned = sum(
        1 for key, edge_idx in snapshot.edge_index.items()
        if "ALIGNED_TO" in key
        for _, t in zip(edge_idx[0], edge_idx[1])
        if snapshot.node_types[t] == "Term"
    )
    terms_total = sum(1 for t in snapshot.node_types if t == "Term")
    entities_described = sum(
        1 for key, edge_idx in snapshot.edge_index.items()
        if "DESCRIBES" in key
        for _, t in zip(edge_idx[0], edge_idx[1])
        if snapshot.node_types[t] == "Entity"
    )
    entities_total = sum(1 for t in snapshot.node_types if t == "Entity")

    grounding = compute_grounding_score(
        terms_aligned, terms_total,
        entities_described, entities_total,
        len(drift_alerts), snapshot.num_nodes,
    )

    summary = {
        "total_nodes": snapshot.num_nodes,
        "total_edges": snapshot.num_edges,
        "link_suggestions": len(link_result.predictions),
        "drift_alerts": len(drift_alerts),
        "communities": len(communities),
        "governance_gaps": len(governance_gaps),
        "isolated_nodes": len(isolated),
        "model_accuracy": round(link_result.model_accuracy, 3),
    }

    return InsightsResponse(
        grounding_score=grounding,
        link_suggestions=link_result.predictions,
        drift_alerts=drift_alerts,
        communities=communities,
        governance_gaps=governance_gaps,
        isolated_nodes=isolated,
        summary=summary,
    )
