"""Export Neo4j knowledge graph to PyG HeteroData.

Reads the heterogeneous graph from Neo4j and converts it to a format
compatible with PyTorch Geometric. Each node/edge type gets its own
feature matrix and edge index, preserving the semantic structure.

Graph schema (from execution/knowledge_graph.py):
  Nodes: Entity, Term, Document, Mention
  Edges: RELATES_TO, DESCRIBES, MENTIONS, REFERS_TO, ALIGNED_TO, ENFORCES
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import numpy as np

log = logging.getLogger(__name__)

NODE_TYPES = ("Entity", "Term", "Document", "Mention")
EDGE_TYPES = ("RELATES_TO", "DESCRIBES", "MENTIONS", "REFERS_TO", "ALIGNED_TO", "ENFORCES")


@dataclass
class GraphSnapshot:
    """Immutable snapshot of the knowledge graph as numpy arrays."""

    node_type_ids: dict[str, int] = field(default_factory=dict)
    node_names: list[str] = field(default_factory=list)
    node_types: list[str] = field(default_factory=list)
    node_features: np.ndarray | None = None
    edge_index: dict[str, np.ndarray] = field(default_factory=dict)
    edge_attrs: dict[str, list[dict[str, Any]]] = field(default_factory=dict)

    @property
    def num_nodes(self) -> int:
        return len(self.node_names)

    @property
    def num_edges(self) -> int:
        return sum(idx.shape[1] for idx in self.edge_index.values()) if self.edge_index else 0


def fetch_graph_snapshot(driver) -> GraphSnapshot:
    """Pull the full knowledge graph from Neo4j into a GraphSnapshot.

    Args:
        driver: A neo4j.GraphDatabase.driver instance.

    Returns:
        A GraphSnapshot with all nodes and edges indexed.
    """
    snapshot = GraphSnapshot()

    # --- nodes ---
    query = "MATCH (n) RETURN labels(n) AS labels, elementId(n) AS eid, properties(n) AS props"
    result = driver.session().run(query)
    node_id_map: dict[str, int] = {}

    for record in result:
        labels = [l for l in record["labels"] if l in NODE_TYPES]
        if not labels:
            continue
        node_type = labels[0]
        eid = record["eid"]
        props = record["props"] or {}
        name = props.get("term") or props.get("name") or props.get("title") or props.get("id") or str(eid)
        idx = len(snapshot.node_names)
        node_id_map[eid] = idx
        snapshot.node_names.append(name)
        snapshot.node_types.append(node_type)

    log.info("Fetched %d nodes from Neo4j", len(snapshot.node_names))

    # --- edges ---
    type_pairs = [
        (src, rel, dst)
        for src in NODE_TYPES
        for rel in EDGE_TYPES
        for dst in NODE_TYPES
    ]
    for src_type, rel_type, dst_type in type_pairs:
        cypher = f"""
            MATCH (a:{src_type})-[r:{rel_type}]->(b:{dst_type})
            RETURN elementId(a) AS src, elementId(b) AS dst, properties(r) AS props
        """
        try:
            result = driver.session().run(cypher)
        except Exception:
            continue

        sources, targets = [], []
        attrs = []
        for record in result:
            src_idx = node_id_map.get(record["src"])
            dst_idx = node_id_map.get(record["dst"])
            if src_idx is None or dst_idx is None:
                continue
            sources.append(src_idx)
            targets.append(dst_idx)
            attrs.append(record["props"] or {})

        if sources:
            key = f"{src_type}__{rel_type}__{dst_type}"
            snapshot.edge_index[key] = np.array([sources, targets], dtype=np.int64)
            snapshot.edge_attrs[key] = attrs

    log.info(
        "Fetched %d edge types (%d total edges) from Neo4j",
        len(snapshot.edge_index),
        snapshot.num_edges,
    )

    return snapshot


def snapshot_to_hetero_data(snapshot: GraphSnapshot):
    """Convert a GraphSnapshot to PyG HeteroData.

    Requires torch and torch_geometric to be installed.

    Returns:
        torch_geometric.data.HeteroData
    """
    import torch
    from torch_geometric.data import HeteroData

    data = HeteroData()

    # node types
    type_counters: dict[str, int] = {}
    type_indices: dict[str, list[int]] = {}
    for i, ntype in enumerate(snapshot.node_types):
        type_counters.setdefault(ntype, 0)
        type_indices.setdefault(ntype, []).append(i)

    for ntype, indices in type_indices.items():
        x = torch.zeros(len(indices), 1, dtype=torch.float)
        data[ntype].x = x
        data[ntype].node_index = torch.tensor(indices, dtype=torch.long)

    # edge types
    for key, edge_idx in snapshot.edge_index.items():
        src_type, rel_type, dst_type = key.split("__")
        edge_index = torch.tensor(edge_idx, dtype=torch.long)
        data[(src_type, rel_type, dst_type)].edge_index = edge_index

    return data


def fetch_and_convert(driver):
    """Convenience: fetch from Neo4j and return PyG HeteroData."""
    snapshot = fetch_graph_snapshot(driver)
    return snapshot, snapshot_to_hetero_data(snapshot)
