import type { AlignmentBand, AlignmentQueue } from "@/api/ontology";

export type GraphNode = {
  id: string;
  label: string;
  kind: "term" | "class";
  x: number;
  y: number;
};

export type GraphEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  band: AlignmentBand;
};

export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

const ROW_HEIGHT = 60;
const TOP_Y = 40;
const TERM_X = 460;
const CLASS_X = 140;

export const termNodeId = (term: string): string => `term:${term}`;
export const classNodeId = (uri: string): string => `class:${uri}`;

/** Deterministic two-column layout — FIBO classes left, terms right, both
 * alphabetically sorted and evenly spaced. Pure function of the queue's
 * content, never randomized: the same queue always produces the same graph,
 * and only terms with a real candidate get an edge — unmapped terms render
 * as unconnected nodes, never a fabricated link. */
export function buildGraph(queue: AlignmentQueue): Graph {
  const sortedItems = [...queue.items].sort((a, b) => a.term.localeCompare(b.term));

  const termNodes: GraphNode[] = sortedItems.map((item, index) => ({
    id: termNodeId(item.term),
    label: item.term,
    kind: "term",
    x: TERM_X,
    y: TOP_Y + index * ROW_HEIGHT,
  }));

  const classLabelByUri = new Map<string, string>();
  const edges: GraphEdge[] = [];
  for (const item of sortedItems) {
    if (item.candidate_uri === null || item.candidate_label === null) continue;
    if (!classLabelByUri.has(item.candidate_uri)) {
      classLabelByUri.set(item.candidate_uri, item.candidate_label);
    }
    edges.push({
      id: `${termNodeId(item.term)}->${classNodeId(item.candidate_uri)}`,
      sourceId: termNodeId(item.term),
      targetId: classNodeId(item.candidate_uri),
      band: item.band,
    });
  }

  const sortedClassUris = [...classLabelByUri.keys()].sort((a, b) => {
    const labelA = classLabelByUri.get(a) ?? "";
    const labelB = classLabelByUri.get(b) ?? "";
    return labelA.localeCompare(labelB);
  });
  const classNodes: GraphNode[] = sortedClassUris.map((uri, index) => ({
    id: classNodeId(uri),
    label: classLabelByUri.get(uri) ?? "",
    kind: "class",
    x: CLASS_X,
    y: TOP_Y + index * ROW_HEIGHT,
  }));

  return { nodes: [...classNodes, ...termNodes], edges };
}
