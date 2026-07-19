import type { AlignmentBand, AlignmentQueue } from "@/api/ontology";
import { buildGraph, termNodeId } from "../graphLayout";

type OntologyGraphProps = {
  queue: AlignmentQueue;
  selectedTerm: string | null;
  onSelectTerm: (term: string) => void;
};

const edgeColor: Record<AlignmentBand, string> = {
  auto: "#059669",
  review: "#94a3b8",
  rejected: "#f43f5e",
  unmapped: "#cbd5e1",
};

export function OntologyGraph({ queue, selectedTerm, onSelectTerm }: OntologyGraphProps) {
  const graph = buildGraph(queue);
  const width = 600;
  const height = graph.nodes.reduce((max, node) => Math.max(max, node.y), 0) + 80;

  return (
    <div
      role="group"
      aria-label="Alignment graph"
      className="relative overflow-auto rounded-xl border border-slate-200 bg-slate-50"
      style={{ height: 360 }}
    >
      <svg width={width} height={height} className="absolute inset-0">
        {graph.edges.map((edge) => {
          const source = graph.nodes.find((n) => n.id === edge.sourceId);
          const target = graph.nodes.find((n) => n.id === edge.targetId);
          if (source === undefined || target === undefined) return null;
          const isSelected = selectedTerm !== null && edge.sourceId === termNodeId(selectedTerm);
          return (
            <line
              key={edge.id}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke={edgeColor[edge.band]}
              strokeWidth={isSelected ? 2.5 : 1.5}
              strokeDasharray={edge.band === "review" ? "6 4" : undefined}
              opacity={isSelected ? 1 : 0.6}
            />
          );
        })}
      </svg>
      {graph.nodes.map((node) => {
        const isSelected = node.kind === "term" && node.label === selectedTerm;
        const style = { left: `${node.x}px`, top: `${node.y}px` };
        const classes = `absolute -translate-x-1/2 -translate-y-1/2 rounded-md border px-2 py-1 text-xs shadow-sm ${
          isSelected ? "border-emerald-500 bg-white ring-2 ring-emerald-200" : "border-slate-200 bg-white"
        }`;
        if (node.kind === "class") {
          return (
            <div key={node.id} className={classes} style={style}>
              {node.label}
            </div>
          );
        }
        return (
          <button
            key={node.id}
            type="button"
            onClick={() => onSelectTerm(node.label)}
            className={classes}
            style={style}
          >
            {node.label}
          </button>
        );
      })}
    </div>
  );
}
