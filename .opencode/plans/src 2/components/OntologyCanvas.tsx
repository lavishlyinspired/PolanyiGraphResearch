import React from "react";
import { Database, Circle, ArrowRight } from "lucide-react";
import type { FiboNode, AlignmentLink } from "@/lib/data";

interface OntologyCanvasProps {
  nodes: FiboNode[];
  links: AlignmentLink[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
}

export function OntologyCanvas({
  nodes,
  links,
  selectedNodeId,
  onSelectNode,
}: OntologyCanvasProps) {
  const nodeMap = React.useMemo(() => {
    const m = new Map<string, FiboNode>();
    nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [nodes]);

  return (
    <div className="relative flex-1 overflow-hidden bg-slate-50">
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: "radial-gradient(circle, #cbd5e1 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      <svg className="absolute inset-0 h-full w-full">
        <defs>
          <marker
            id="arrow-approved"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#059669" />
          </marker>
          <marker
            id="arrow-pending"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
          </marker>
          <marker
            id="arrow-rejected"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#f43f5e" />
          </marker>
        </defs>
        {links.map((link) => {
          const source = nodeMap.get(link.sourceId);
          const target = nodeMap.get(link.targetId);
          if (!source || !target) return null;

          const isSelected =
            link.sourceId === selectedNodeId || link.targetId === selectedNodeId;

          const strokeColor =
            link.status === "approved"
              ? "#059669"
              : link.status === "rejected"
              ? "#f43f5e"
              : "#94a3b8";

          const markerId = `arrow-${link.status}`;

          return (
            <g key={link.id}>
              <line
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={strokeColor}
                strokeWidth={isSelected ? 2.5 : 1.5}
                strokeDasharray={link.status === "pending" ? "6 4" : undefined}
                opacity={isSelected ? 1 : 0.5}
                markerEnd={`url(#${markerId})`}
              />
              {link.status === "approved" && (
                <circle
                  cx={(source.x + target.x) / 2}
                  cy={(source.y + target.y) / 2}
                  r={4}
                  fill="#059669"
                />
              )}
            </g>
          );
        })}
      </svg>

      {nodes.map((node) => {
        const isSelected = node.id === selectedNodeId;
        const hasLinks = links.some(
          (l) =>
            (l.sourceId === node.id || l.targetId === node.id) &&
            l.status !== "rejected"
        );

        return (
          <button
            key={node.id}
            onClick={() => onSelectNode(node.id)}
            className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-xl border px-3 py-2 shadow-sm transition-all hover:shadow-md ${
              isSelected
                ? "border-emerald-500 bg-white ring-2 ring-emerald-200"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
            style={{ left: `${node.x}px`, top: `${node.y}px` }}
          >
            <div className="flex items-center gap-1.5">
              {node.source === "FIBO" ? (
                <Database className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Circle className="h-3.5 w-3.5 text-slate-400" />
              )}
              <span className="text-xs font-semibold text-slate-900">{node.label}</span>
            </div>
            <span className="text-[10px] text-slate-400">{node.source}</span>
            {hasLinks && (
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
            )}
          </button>
        );
      })}

      <div className="absolute bottom-4 right-4 rounded-lg border border-slate-200 bg-white/90 px-4 py-3 shadow-md backdrop-blur-sm">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Legend
        </h4>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <ArrowRight className="h-3 w-3 text-emerald-600" />
            <span className="text-xs text-slate-600">Approved mapping</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-0.5 w-6 border-t-2 border-dashed border-slate-400" />
            <span className="text-xs text-slate-600">Pending mapping</span>
          </div>
          <div className="flex items-center gap-2">
            <ArrowRight className="h-3 w-3 text-rose-500" />
            <span className="text-xs text-slate-600">Rejected mapping</span>
          </div>
          <div className="mt-2 flex items-center gap-2 border-t border-slate-100 pt-2">
            <Database className="h-3 w-3 text-emerald-600" />
            <span className="text-xs text-slate-600">FIBO source</span>
          </div>
          <div className="flex items-center gap-2">
            <Circle className="h-3 w-3 text-slate-400" />
            <span className="text-xs text-slate-600">Databricks entity</span>
          </div>
        </div>
      </div>
    </div>
  );
}