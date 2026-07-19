import type { Layout } from "./graphLayout";

type GraphCanvasProps = {
  layout: Layout;
  colorFor: (label: string) => string;
  onSelectNode: (id: number) => void;
  ariaLabel: string;
};

/** Presentational SVG+button rendering of a laid-out graph, shared by every
 * perspective (Full graph, Glossary, and future perspectives) — each owns its
 * own data fetching and layout, this just draws whatever real layout it's given. */
export function GraphCanvas({ layout, colorFor, onSelectNode, ariaLabel }: GraphCanvasProps) {
  const width = layout.nodes.reduce((max, n) => Math.max(max, n.x), 0) + 160;
  const height = layout.nodes.reduce((max, n) => Math.max(max, n.y), 0) + 80;

  return (
    <div
      role="group"
      aria-label={ariaLabel}
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
          onClick={() => onSelectNode(node.id)}
          style={{
            position: "absolute",
            left: node.x,
            top: node.y,
            transform: "translate(-50%, -50%)",
            borderColor: colorFor(node.label),
          }}
          className="btn btn-sm"
        >
          {node.name}
        </button>
      ))}
    </div>
  );
}
