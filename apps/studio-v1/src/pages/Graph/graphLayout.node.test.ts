import { describe, expect, it } from "vitest";
import { buildLayout } from "./graphLayout";
import type { GraphEdge, GraphNode } from "@/api/graph";

function getMockNode(overrides?: Partial<GraphNode>): GraphNode {
  return { id: 1, label: "Entity", name: "trades", properties: {}, ...overrides };
}

describe("buildLayout", () => {
  it("returns no nodes or edges for empty input", () => {
    expect(buildLayout([], [])).toEqual({ nodes: [], edges: [] });
  });

  it("groups nodes into columns by label", () => {
    const nodes = [
      getMockNode({ id: 1, label: "Entity", name: "trades" }),
      getMockNode({ id: 2, label: "Term", name: "Notional Amount" }),
    ];
    const layout = buildLayout(nodes, []);
    const entityNode = layout.nodes.find((n) => n.id === 1);
    const termNode = layout.nodes.find((n) => n.id === 2);
    expect(entityNode?.x).not.toEqual(termNode?.x);
  });

  it("is a pure function — the same input always produces the same layout", () => {
    const nodes = [getMockNode({ id: 1 }), getMockNode({ id: 2, name: "counterparties" })];
    const edges: GraphEdge[] = [{ source: 1, target: 2, type: "RELATES_TO" }];
    expect(buildLayout(nodes, edges)).toEqual(buildLayout(nodes, edges));
  });

  it("assigns distinct y coordinates within the same column", () => {
    const nodes = [
      getMockNode({ id: 1, name: "trades" }),
      getMockNode({ id: 2, name: "counterparties" }),
      getMockNode({ id: 3, name: "instruments" }),
    ];
    const layout = buildLayout(nodes, []);
    const ys = layout.nodes.map((n) => n.y);
    expect(new Set(ys).size).toBe(ys.length);
  });

  it("preserves every real edge, mapped to source/target node ids", () => {
    const nodes = [getMockNode({ id: 1 }), getMockNode({ id: 2, name: "counterparties" })];
    const edges: GraphEdge[] = [{ source: 1, target: 2, type: "RELATES_TO" }];
    const layout = buildLayout(nodes, edges);
    expect(layout.edges).toEqual([{ id: "1-RELATES_TO-2", sourceId: 1, targetId: 2, type: "RELATES_TO" }]);
  });

  it("never fabricates an edge for nodes that aren't actually connected", () => {
    const nodes = [getMockNode({ id: 1 }), getMockNode({ id: 2, name: "counterparties" })];
    const layout = buildLayout(nodes, []);
    expect(layout.edges).toEqual([]);
  });
});
