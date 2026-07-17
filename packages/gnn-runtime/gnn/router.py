"""FastAPI router for the GET /api/insights endpoint.

Mount this router into the main Polanyi API app to expose GNN-powered
insights to the Studio frontend.

Usage:
    from gnn.router import insights_router
    app.include_router(insights_router)
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

insights_router = APIRouter(tags=["insights"])


@insights_router.get("/api/insights")
async def get_insights():
    """Return GNN-powered insights for the Knowledge Graph.

    Response includes:
      - grounding_score: 0-1 quality metric
      - link_suggestions: predicted ALIGNED_TO edges
      - drift_alerts: semantic drift detections
      - communities: detected clusters
      - governance_gaps: terms/entities missing governance
      - isolated_nodes: disconnected vertices
      - summary: aggregate counts
    """
    try:
        from execution.knowledge_graph import Neo4jGraphStore
        from gnn.insights import generate_insights
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="GNN runtime not available. Install polanyi-gnn package.",
        )

    store = Neo4jGraphStore()
    if not store.is_available():
        raise HTTPException(
            status_code=503,
            detail="Neo4j is not reachable. Start the database and retry.",
        )

    try:
        response = generate_insights(store._driver)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Insights pipeline failed: {e}")

    return response.to_dict()
