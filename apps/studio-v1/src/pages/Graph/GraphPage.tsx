import { useEffect, useState } from "react";
import { fetchGraphStats, Neo4jUnavailableError, type GraphStats } from "@/api/health";
import { fetchGraphExplore, materializeGraph, type GraphExplore, type GraphNode } from "@/api/graph";
import { useNavigation } from "@/navigation";
import { buildLayout } from "./graphLayout";

type State =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "error" }
  | { kind: "ready"; stats: GraphStats };

const LABELS = ["Entity", "Term", "Document", "Mention"] as const;
const labelColor: Record<string, string> = {
  Entity: "#059669",
  Term: "#6366f1",
  Document: "#d97706",
  Mention: "#94a3b8",
};

function formatSyncedAt(materializedAt: string | null): string {
  if (materializedAt === null) return "Never synced";
  return `Synced ${new Date(materializedAt).toLocaleString()}`;
}

export function GraphPage() {
  const { navigate } = useNavigation();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [explore, setExplore] = useState<GraphExplore>({ nodes: [], edges: [] });
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [materializing, setMaterializing] = useState(false);

  function loadStats() {
    void fetchGraphStats()
      .then((stats) => setState({ kind: "ready", stats }))
      .catch((error) => {
        setState(error instanceof Neo4jUnavailableError ? { kind: "unavailable" } : { kind: "error" });
      });
  }

  useEffect(loadStats, []);

  useEffect(() => {
    if (state.kind === "ready" && state.stats.nodes > 0) {
      void fetchGraphExplore()
        .then(setExplore)
        .catch(() => setExplore({ nodes: [], edges: [] }));
    }
  }, [state]);

  function handleMaterialize() {
    setMaterializing(true);
    void materializeGraph()
      .then(() => {
        setMaterializing(false);
        loadStats();
      })
      .catch(() => setMaterializing(false));
  }

  if (state.kind === "loading") {
    return <p>Loading…</p>;
  }

  if (state.kind === "unavailable") {
    return (
      <main className="view">
        <div className="view-head">
          <h1>Knowledge Graph</h1>
        </div>
        <div className="panel" style={{ padding: 16 }}>
          <p style={{ margin: 0 }}>
            This view requires Neo4j. Start it (<code>make up</code>), then reload.
          </p>
        </div>
      </main>
    );
  }

  if (state.kind === "error") {
    return (
      <main className="view">
        <div className="view-head">
          <h1>Knowledge Graph</h1>
        </div>
        <div className="panel" style={{ padding: 16 }}>
          <p style={{ margin: 0 }}>Couldn&apos;t load the knowledge graph.</p>
        </div>
      </main>
    );
  }

  const layout = buildLayout(explore.nodes, explore.edges);
  const width = layout.nodes.reduce((max, n) => Math.max(max, n.x), 0) + 160;
  const height = layout.nodes.reduce((max, n) => Math.max(max, n.y), 0) + 80;

  return (
    <main className="view">
      <div className="view-head">
        <div>
          <h1>Knowledge Graph</h1>
          <p className="sub">
            {state.stats.nodes} nodes · {state.stats.edges} relationships ·{" "}
            {formatSyncedAt(state.stats.materialized_at)}
          </p>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-sm" onClick={() => navigate("console")}>
            Open in Query Console
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={materializing}
            onClick={handleMaterialize}
          >
            {materializing ? "Materializing…" : "Re-materialize"}
          </button>
        </div>
      </div>

      <ul role="list" aria-label="Legend" style={{ listStyle: "none", display: "flex", gap: 14, padding: 0 }}>
        {LABELS.map((label) => (
          <li key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: labelColor[label],
              }}
            />
            {label}
          </li>
        ))}
      </ul>

      {state.stats.nodes === 0 ? (
        <div className="panel" style={{ padding: 16, marginTop: 12 }}>
          <p style={{ margin: 0 }}>
            Materialize the graph to populate it from your current semantic context — entities,
            glossary terms, and their real relationships.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 18, marginTop: 12 }}>
          <div
            role="group"
            aria-label="Knowledge graph"
            className="panel"
            style={{ flex: 1, position: "relative", overflow: "auto", height: 420 }}
          >
            <svg width={width} height={height} className="absolute" style={{ position: "absolute" }}>
              {layout.edges.map((edge) => {
                const source = layout.nodes.find((n) => n.id === edge.sourceId);
                const target = layout.nodes.find((n) => n.id === edge.targetId);
                if (source === undefined || target === undefined) return null;
                return (
                  <line
                    key={edge.id}
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke="#94a3b8"
                    strokeWidth={1.5}
                    opacity={0.6}
                  />
                );
              })}
            </svg>
            {layout.nodes.map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => {
                  const full = explore.nodes.find((n) => n.id === node.id) ?? null;
                  setSelected(full);
                }}
                style={{
                  position: "absolute",
                  left: node.x,
                  top: node.y,
                  transform: "translate(-50%, -50%)",
                  borderColor: labelColor[node.label] ?? "#94a3b8",
                }}
                className="btn btn-sm"
              >
                {node.name}
              </button>
            ))}
          </div>

          <section aria-label="Inspector" className="panel" style={{ width: 280, padding: 16 }}>
            {selected === null ? (
              <p className="dim">Select a node to inspect it.</p>
            ) : (
              <>
                <h2>{selected.name}</h2>
                <p className="dim">{selected.label}</p>
                {Object.entries(selected.properties).map(([key, value]) => (
                  <p key={key} style={{ margin: "4px 0" }}>
                    <b>{key}:</b> {String(value)}
                  </p>
                ))}
                <p className="dim" style={{ marginTop: 10 }}>
                  Relationships
                </p>
                {explore.edges
                  .filter((edge) => edge.source === selected.id || edge.target === selected.id)
                  .map((edge, index) => (
                    <p key={index} className="mono" style={{ margin: "4px 0" }}>
                      {edge.type}
                    </p>
                  ))}
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
