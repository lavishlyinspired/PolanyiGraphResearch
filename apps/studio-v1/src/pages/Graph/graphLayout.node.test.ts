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

  it("spaces columns by exactly COLUMN_WIDTH (220px)", () => {
    const nodes = [getMockNode({ id: 1, label: "Entity" }), getMockNode({ id: 2, label: "Term", name: "X" })];
    const layout = buildLayout(nodes, []);
    const entityX = layout.nodes.find((n) => n.id === 1)?.x;
    const termX = layout.nodes.find((n) => n.id === 2)?.x;
    expect(termX! - entityX!).toBe(220);
  });

  it("increases y by exactly ROW_HEIGHT (60px) for each subsequent row in a column", () => {
    const nodes = [getMockNode({ id: 1, name: "a" }), getMockNode({ id: 2, name: "b" })];
    const layout = buildLayout(nodes, []);
    const first = layout.nodes.find((n) => n.id === 1)!;
    const second = layout.nodes.find((n) => n.id === 2)!;
    expect(second.y - first.y).toBe(60);
  });

  it("places an unrecognized label in its own column after all named columns", () => {
    const nodes = [getMockNode({ id: 1, label: "Entity", name: "e" }), getMockNode({ id: 2, label: "FIBO", name: "f" })];
    const layout = buildLayout(nodes, []);
    const entityX = layout.nodes.find((n) => n.id === 1)!.x;
    const fiboX = layout.nodes.find((n) => n.id === 2)!.x;
    expect(fiboX).toBeGreaterThan(entityX);
  });

  it("orders same-column nodes alphabetically by name, not by input order", () => {
    const nodes = [getMockNode({ id: 1, name: "zebra" }), getMockNode({ id: 2, name: "apple" })];
    const layout = buildLayout(nodes, []);
    const topRow = layout.nodes.reduce((min, n) => (n.y < min.y ? n : min));
    expect(topRow.name).toBe("apple");
  });

  it("orders known labels as Entity, Term, Document, Mention columns left to right", () => {
    const nodes = [
      getMockNode({ id: 1, label: "Mention", name: "m" }),
      getMockNode({ id: 2, label: "Document", name: "d" }),
      getMockNode({ id: 3, label: "Term", name: "t" }),
      getMockNode({ id: 4, label: "Entity", name: "e" }),
    ];
    const layout = buildLayout(nodes, []);
    const xOf = (id: number) => layout.nodes.find((n) => n.id === id)!.x;
    expect(xOf(4)).toBeLessThan(xOf(3));
    expect(xOf(3)).toBeLessThan(xOf(2));
    expect(xOf(2)).toBeLessThan(xOf(1));
  });
});
