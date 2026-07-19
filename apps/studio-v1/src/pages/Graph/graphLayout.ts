import type { GraphEdge, GraphNode } from "@/api/graph";

export type LayoutNode = { id: number; label: string; name: string; x: number; y: number };
export type LayoutEdge = { id: string; sourceId: number; targetId: number; type: string };
export type Layout = { nodes: LayoutNode[]; edges: LayoutEdge[] };

const ROW_HEIGHT = 60;
const TOP_Y = 40;
const COLUMN_WIDTH = 220;
const LEFT_X = 120;

// Matches the real node labels materialize() produces — an unrecognized
// label still gets its own column, just placed last, rather than dropped.
const COLUMN_ORDER = ["Entity", "Term", "Document", "Mention"];

function columnRank(label: string): number {
  const index = COLUMN_ORDER.indexOf(label);
  return index === -1 ? COLUMN_ORDER.length : index;
}

/** Deterministic multi-column layout — one column per real node label,
 * alphabetically sorted within each column. Pure function of the real
 * nodes/edges: never invents an edge, never randomizes position. */
export function buildLayout(nodes: GraphNode[], edges: GraphEdge[]): Layout {
  const sortedNodes = [...nodes].sort((a, b) => {
    const rankDiff = columnRank(a.label) - columnRank(b.label);
    return rankDiff !== 0 ? rankDiff : a.name.localeCompare(b.name);
  });

  const columnIndexByLabel = new Map<string, number>();
  const rowCountByColumn = new Map<number, number>();
  const layoutNodes: LayoutNode[] = sortedNodes.map((node) => {
    let columnIndex = columnIndexByLabel.get(node.label);
    if (columnIndex === undefined) {
      columnIndex = columnIndexByLabel.size;
      columnIndexByLabel.set(node.label, columnIndex);
    }
    const row = rowCountByColumn.get(columnIndex) ?? 0;
    rowCountByColumn.set(columnIndex, row + 1);
    return {
      id: node.id,
      label: node.label,
      name: node.name,
      x: LEFT_X + columnIndex * COLUMN_WIDTH,
      y: TOP_Y + row * ROW_HEIGHT,
    };
  });

  const layoutEdges: LayoutEdge[] = edges.map((edge) => ({
    id: `${edge.source}-${edge.type}-${edge.target}`,
    sourceId: edge.source,
    targetId: edge.target,
    type: edge.type,
  }));

  return { nodes: layoutNodes, edges: layoutEdges };
}
