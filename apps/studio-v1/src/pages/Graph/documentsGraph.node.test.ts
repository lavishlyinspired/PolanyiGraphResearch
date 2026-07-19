import { describe, expect, it } from "vitest";
import { buildDocumentSummary, buildMentionChains, filterDocumentGraph } from "./documentsGraph";
import type { GraphEdge, GraphExplore, GraphNode } from "@/api/graph";
import type { Rule } from "@/api/validation";
import type { GlossaryEntry } from "@/api/context";

function node(overrides?: Partial<GraphNode>): GraphNode {
  return { id: 1, label: "Document", name: "q1-memo", properties: {}, ...overrides };
}

function edge(overrides?: Partial<GraphEdge>): GraphEdge {
  return { source: 1, target: 2, type: "MENTIONS", ...overrides };
}

function getMockRule(overrides?: Partial<Rule>): Rule {
  return {
    rule_id: "BR-001",
    name: "Sanctioned Check",
    description: "d",
    severity: "CRITICAL",
    sql_hints: [],
    affected_entities: ["counterparties"],
    ...overrides,
  };
}

function getMockGlossaryEntry(overrides?: Partial<GlossaryEntry>): GlossaryEntry {
  return {
    term: "Counterparty",
    definition: "d",
    formula: null,
    source_tables: ["counterparties"],
    source_columns: [],
    unit: null,
    synonyms: [],
    ontology_class: null,
    ontology_uri: null,
    ...overrides,
  };
}

describe("filterDocumentGraph", () => {
  it("returns no nodes or edges for an empty graph", () => {
    expect(filterDocumentGraph({ nodes: [], edges: [] })).toEqual({ nodes: [], edges: [] });
  });

  it("keeps Document, Mention, and Term nodes but drops Entity nodes", () => {
    const explore: GraphExplore = {
      nodes: [
        node({ id: 1, label: "Document" }),
        node({ id: 2, label: "Mention" }),
        node({ id: 3, label: "Term" }),
        node({ id: 4, label: "Entity" }),
      ],
      edges: [],
    };
    const filtered = filterDocumentGraph(explore);
    expect(filtered.nodes.map((n) => n.label).sort()).toEqual(["Document", "Mention", "Term"]);
  });

  it("drops an edge if either endpoint was filtered out", () => {
    const explore: GraphExplore = {
      nodes: [node({ id: 1, label: "Document" }), node({ id: 4, label: "Entity" })],
      edges: [edge({ source: 1, target: 4, type: "DESCRIBES" })],
    };
    expect(filterDocumentGraph(explore).edges).toEqual([]);
  });

  it("keeps a real edge when both endpoints survive", () => {
    const explore: GraphExplore = {
      nodes: [node({ id: 1, label: "Document" }), node({ id: 2, label: "Mention" })],
      edges: [edge({ source: 1, target: 2, type: "MENTIONS" })],
    };
    expect(filterDocumentGraph(explore).edges).toEqual([edge({ source: 1, target: 2, type: "MENTIONS" })]);
  });
});

describe("buildDocumentSummary", () => {
  it("returns no rows for no documents", () => {
    expect(buildDocumentSummary({ nodes: [], edges: [] })).toEqual([]);
  });

  it("counts real mentions and how many actually resolved to a term", () => {
    const explore: GraphExplore = {
      nodes: [
        node({ id: 1, label: "Document", name: "q1-memo" }),
        node({ id: 2, label: "Mention" }),
        node({ id: 3, label: "Mention" }),
        node({ id: 4, label: "Term" }),
      ],
      edges: [
        edge({ source: 1, target: 2, type: "MENTIONS" }),
        edge({ source: 1, target: 3, type: "MENTIONS" }),
        edge({ source: 2, target: 4, type: "REFERS_TO" }),
      ],
    };
    expect(buildDocumentSummary(explore)).toEqual([{ document: "q1-memo", mentions: 2, resolved: 1 }]);
  });

  it("reports zero resolved rather than fabricating a count for an unresolved mention", () => {
    const explore: GraphExplore = {
      nodes: [node({ id: 1, label: "Document", name: "doc" }), node({ id: 2, label: "Mention" })],
      edges: [edge({ source: 1, target: 2, type: "MENTIONS" })],
    };
    expect(buildDocumentSummary(explore)).toEqual([{ document: "doc", mentions: 1, resolved: 0 }]);
  });

  it("reports zero mentions for a document with none, not a fabricated placeholder", () => {
    const explore: GraphExplore = { nodes: [node({ id: 1, label: "Document", name: "doc" })], edges: [] };
    expect(buildDocumentSummary(explore)).toEqual([{ document: "doc", mentions: 0, resolved: 0 }]);
  });

  it("only counts real MENTIONS edges toward a document's mention count, not other edge types", () => {
    const explore: GraphExplore = {
      nodes: [node({ id: 1, label: "Document", name: "doc" }), node({ id: 2, label: "Mention" })],
      edges: [edge({ source: 1, target: 2, type: "MENTIONS" }), edge({ source: 1, target: 2, type: "OTHER" })],
    };
    expect(buildDocumentSummary(explore)).toEqual([{ document: "doc", mentions: 1, resolved: 0 }]);
  });

  it("only counts a mention as resolved via a real REFERS_TO edge, not any edge originating from it", () => {
    const explore: GraphExplore = {
      nodes: [node({ id: 1, label: "Document", name: "doc" }), node({ id: 2, label: "Mention" })],
      edges: [edge({ source: 1, target: 2, type: "MENTIONS" }), edge({ source: 2, target: 99, type: "SOME_OTHER_EDGE" })],
    };
    expect(buildDocumentSummary(explore)).toEqual([{ document: "doc", mentions: 1, resolved: 0 }]);
  });
});

describe("buildMentionChains", () => {
  it("returns no rows for no mentions", () => {
    expect(buildMentionChains({ nodes: [], edges: [] }, [], [])).toEqual([]);
  });

  it("builds a real document -> mention -> term chain", () => {
    const explore: GraphExplore = {
      nodes: [
        node({ id: 1, label: "Document", name: "q1-memo" }),
        node({ id: 2, label: "Mention", name: "m0", properties: { text: "Acme Bank Corp" } }),
        node({ id: 3, label: "Term", name: "Counterparty" }),
      ],
      edges: [
        edge({ source: 1, target: 2, type: "MENTIONS" }),
        edge({ source: 2, target: 3, type: "REFERS_TO" }),
      ],
    };
    const rows = buildMentionChains(explore, [], []);
    expect(rows).toEqual([
      { document: "q1-memo", mentionText: "Acme Bank Corp", resolvedTerm: "Counterparty", relatedRules: [] },
    ]);
  });

  it("reports resolvedTerm as null rather than fabricating one for an unresolved mention", () => {
    const explore: GraphExplore = {
      nodes: [node({ id: 1, label: "Document", name: "doc" }), node({ id: 2, label: "Mention", properties: { text: "??" } })],
      edges: [edge({ source: 1, target: 2, type: "MENTIONS" })],
    };
    const rows = buildMentionChains(explore, [], []);
    expect(rows[0]?.resolvedTerm).toBeNull();
    expect(rows[0]?.relatedRules).toEqual([]);
  });

  it("derives related rules from real shared source tables between the term and the rule", () => {
    const explore: GraphExplore = {
      nodes: [
        node({ id: 1, label: "Document", name: "doc" }),
        node({ id: 2, label: "Mention", properties: { text: "Acme" } }),
        node({ id: 3, label: "Term", name: "Counterparty" }),
      ],
      edges: [
        edge({ source: 1, target: 2, type: "MENTIONS" }),
        edge({ source: 2, target: 3, type: "REFERS_TO" }),
      ],
    };
    const rows = buildMentionChains(
      explore,
      [getMockRule({ rule_id: "BR-001", affected_entities: ["counterparties"] })],
      [getMockGlossaryEntry({ term: "Counterparty", source_tables: ["counterparties"] })],
    );
    expect(rows[0]?.relatedRules).toEqual(["BR-001"]);
  });

  it("never derives a rule that shares no real table with the term", () => {
    const explore: GraphExplore = {
      nodes: [
        node({ id: 1, label: "Document", name: "doc" }),
        node({ id: 2, label: "Mention", properties: { text: "Acme" } }),
        node({ id: 3, label: "Term", name: "Counterparty" }),
      ],
      edges: [
        edge({ source: 1, target: 2, type: "MENTIONS" }),
        edge({ source: 2, target: 3, type: "REFERS_TO" }),
      ],
    };
    const rows = buildMentionChains(
      explore,
      [getMockRule({ rule_id: "BR-002", affected_entities: ["trades"] })],
      [getMockGlossaryEntry({ term: "Counterparty", source_tables: ["counterparties"] })],
    );
    expect(rows[0]?.relatedRules).toEqual([]);
  });

  it("never crashes and reports no related rules for a resolved term with no matching glossary entry", () => {
    const explore: GraphExplore = {
      nodes: [
        node({ id: 1, label: "Document", name: "doc" }),
        node({ id: 2, label: "Mention", properties: { text: "x" } }),
        node({ id: 3, label: "Term", name: "Orphan Term" }),
      ],
      edges: [
        edge({ source: 1, target: 2, type: "MENTIONS" }),
        edge({ source: 2, target: 3, type: "REFERS_TO" }),
      ],
    };
    expect(() => buildMentionChains(explore, [getMockRule()], [])).not.toThrow();
    expect(buildMentionChains(explore, [getMockRule()], [])[0]?.relatedRules).toEqual([]);
  });

  it("derives a rule when only some of its tables overlap the term's, not requiring every table to match", () => {
    const explore: GraphExplore = {
      nodes: [
        node({ id: 1, label: "Document", name: "doc" }),
        node({ id: 2, label: "Mention", properties: { text: "Acme" } }),
        node({ id: 3, label: "Term", name: "Counterparty" }),
      ],
      edges: [
        edge({ source: 1, target: 2, type: "MENTIONS" }),
        edge({ source: 2, target: 3, type: "REFERS_TO" }),
      ],
    };
    const rows = buildMentionChains(
      explore,
      [getMockRule({ rule_id: "BR-001", affected_entities: ["counterparties", "widgets"] })],
      [getMockGlossaryEntry({ term: "Counterparty", source_tables: ["counterparties"] })],
    );
    expect(rows[0]?.relatedRules).toEqual(["BR-001"]);
  });

  it("only resolves a MENTIONS edge's source through a real Document node, not any node sharing that id", () => {
    const explore: GraphExplore = {
      nodes: [node({ id: 1, label: "Mention", name: "decoy" }), node({ id: 2, label: "Mention", properties: { text: "x" } })],
      edges: [edge({ source: 1, target: 2, type: "MENTIONS" })],
    };
    expect(buildMentionChains(explore, [], [])).toEqual([]);
  });

  it("only resolves a MENTIONS edge's target through a real Mention node, not any node sharing that id", () => {
    const explore: GraphExplore = {
      nodes: [node({ id: 1, label: "Document", name: "doc" }), node({ id: 2, label: "Document", name: "decoy" })],
      edges: [edge({ source: 1, target: 2, type: "MENTIONS" })],
    };
    expect(buildMentionChains(explore, [], [])).toEqual([]);
  });

  it("only resolves a REFERS_TO edge's target through a real Term node, not any node sharing that id", () => {
    const explore: GraphExplore = {
      nodes: [
        node({ id: 1, label: "Document", name: "doc" }),
        node({ id: 2, label: "Mention", properties: { text: "x" } }),
        node({ id: 3, label: "Document", name: "decoy-term" }),
      ],
      edges: [edge({ source: 1, target: 2, type: "MENTIONS" }), edge({ source: 2, target: 3, type: "REFERS_TO" })],
    };
    const rows = buildMentionChains(explore, [], []);
    expect(rows[0]?.resolvedTerm).toBeNull();
  });

  it("only resolves a mention to a term via a real REFERS_TO edge, not any edge pointing at a Term node", () => {
    const explore: GraphExplore = {
      nodes: [
        node({ id: 1, label: "Document", name: "doc" }),
        node({ id: 2, label: "Mention", properties: { text: "x" } }),
        node({ id: 3, label: "Term", name: "RealTerm" }),
      ],
      edges: [edge({ source: 1, target: 2, type: "MENTIONS" }), edge({ source: 2, target: 3, type: "SOME_OTHER_EDGE" })],
    };
    const rows = buildMentionChains(explore, [], []);
    expect(rows[0]?.resolvedTerm).toBeNull();
  });

  it("only turns a real MENTIONS edge into a chain row, not any doc/mention-shaped edge", () => {
    const explore: GraphExplore = {
      nodes: [node({ id: 1, label: "Document", name: "doc" }), node({ id: 2, label: "Mention", properties: { text: "x" } })],
      edges: [edge({ source: 1, target: 2, type: "NOT_MENTIONS" })],
    };
    expect(buildMentionChains(explore, [], [])).toEqual([]);
  });
});
