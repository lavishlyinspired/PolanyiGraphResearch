import { describe, expect, it } from "vitest";
import { buildGraph, classNodeId, termNodeId } from "./graphLayout";
import type { AlignmentQueue } from "@/api/ontology";

function getMockQueue(overrides?: Partial<AlignmentQueue>): AlignmentQueue {
  return {
    items: [
      {
        term: "Notional Amount",
        band: "auto",
        candidate_label: "MonetaryAmount",
        candidate_uri: "urn:fibo:MonetaryAmount",
        score: 0.97,
        candidates: [],
      },
      {
        term: "Desk",
        band: "unmapped",
        candidate_label: null,
        candidate_uri: null,
        score: 0.0,
        candidates: [],
      },
    ],
    ...overrides,
  };
}

describe("buildGraph", () => {
  it("returns no nodes or edges for an empty queue", () => {
    const graph = buildGraph({ items: [] });
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });

  it("renders an unmapped term as a node with no edge — never a fabricated link", () => {
    const graph = buildGraph(getMockQueue());
    const deskNode = graph.nodes.find((n) => n.id === termNodeId("Desk"));
    expect(deskNode).toBeDefined();
    expect(graph.edges.some((e) => e.sourceId === termNodeId("Desk"))).toBe(false);
  });

  it("creates one edge per term with a real candidate, linking to a class node", () => {
    const graph = buildGraph(getMockQueue());
    const edge = graph.edges.find((e) => e.sourceId === termNodeId("Notional Amount"));
    expect(edge).toBeDefined();
    expect(edge?.targetId).toBe(classNodeId("urn:fibo:MonetaryAmount"));
    expect(edge?.band).toBe("auto");
    expect(graph.nodes.some((n) => n.id === classNodeId("urn:fibo:MonetaryAmount"))).toBe(true);
  });

  it("dedupes a class node shared by multiple terms into one node with two edges", () => {
    const queue = getMockQueue({
      items: [
        {
          term: "Notional Amount",
          band: "auto",
          candidate_label: "MonetaryAmount",
          candidate_uri: "urn:fibo:MonetaryAmount",
          score: 0.97,
          candidates: [],
        },
        {
          term: "Principal Amount",
          band: "auto",
          candidate_label: "MonetaryAmount",
          candidate_uri: "urn:fibo:MonetaryAmount",
          score: 0.95,
          candidates: [],
        },
      ],
    });
    const graph = buildGraph(queue);
    const classNodes = graph.nodes.filter((n) => n.kind === "class");
    expect(classNodes).toHaveLength(1);
    expect(graph.edges).toHaveLength(2);
  });

  it("is a pure function — the same queue always produces the same coordinates", () => {
    const queue = getMockQueue();
    expect(buildGraph(queue)).toEqual(buildGraph(queue));
  });

  it("assigns distinct, non-overlapping y coordinates within each column", () => {
    const queue = getMockQueue({
      items: [
        ...getMockQueue().items,
        {
          term: "Account Name",
          band: "unmapped",
          candidate_label: null,
          candidate_uri: null,
          score: 0.0,
          candidates: [],
        },
      ],
    });
    const graph = buildGraph(queue);
    const termYs = graph.nodes.filter((n) => n.kind === "term").map((n) => n.y);
    expect(new Set(termYs).size).toBe(termYs.length);
  });

  it("places class nodes and term nodes in separate x columns", () => {
    const graph = buildGraph(getMockQueue());
    const classX = graph.nodes.find((n) => n.kind === "class")?.x;
    const termX = graph.nodes.find((n) => n.kind === "term")?.x;
    expect(classX).not.toEqual(termX);
  });
});
