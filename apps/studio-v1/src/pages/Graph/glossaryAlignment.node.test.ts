import { describe, expect, it } from "vitest";
import { alignmentStats, buildAlignmentGraph, buildTermsTable } from "./glossaryAlignment";
import type { AlignmentReviewItem } from "@/api/ontology";
import type { GlossaryEntry } from "@/api/context";

function getMockItem(overrides?: Partial<AlignmentReviewItem>): AlignmentReviewItem {
  return {
    term: "Counterparty",
    band: "auto",
    candidate_label: "fibo:Counterparty",
    candidate_uri: "https://fibo/Counterparty",
    score: 0.97,
    candidates: [],
    ...overrides,
  };
}

function getMockGlossaryEntry(overrides?: Partial<GlossaryEntry>): GlossaryEntry {
  return {
    term: "Counterparty",
    definition: "The legal entity on the other side of a trade.",
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

describe("alignmentStats", () => {
  it("returns all-zero counts for an empty queue", () => {
    expect(alignmentStats([])).toEqual({ auto: 0, review: 0, rejected: 0, unmapped: 0 });
  });

  it("counts each band independently, not conflating bands", () => {
    const items = [
      getMockItem({ term: "Trade", band: "auto" }),
      getMockItem({ term: "Counterparty", band: "auto" }),
      getMockItem({ term: "Risk Score", band: "review" }),
      getMockItem({ term: "Counterparty Type", band: "rejected" }),
      getMockItem({ term: "Settlement Venue", band: "unmapped", candidate_label: null, candidate_uri: null }),
    ];
    expect(alignmentStats(items)).toEqual({ auto: 2, review: 1, rejected: 1, unmapped: 1 });
  });
});

describe("buildTermsTable", () => {
  it("returns an empty table for no items", () => {
    expect(buildTermsTable([], [])).toEqual([]);
  });

  it("joins each item's real source tables from the matching glossary entry", () => {
    const items = [getMockItem({ term: "Counterparty" })];
    const glossary = [getMockGlossaryEntry({ term: "Counterparty", source_tables: ["counterparties", "trades"] })];
    const rows = buildTermsTable(items, glossary);
    expect(rows).toEqual([
      {
        term: "Counterparty",
        band: "auto",
        candidateLabel: "fibo:Counterparty",
        candidateUri: "https://fibo/Counterparty",
        score: 0.97,
        sourceTables: ["counterparties", "trades"],
      },
    ]);
  });

  it("reports no source tables rather than fabricating any when the term has no glossary match", () => {
    const rows = buildTermsTable([getMockItem({ term: "Orphan Term" })], []);
    expect(rows[0]?.sourceTables).toEqual([]);
  });

  it("orders rows by band priority (auto, review, rejected, unmapped) before term name", () => {
    const items = [
      getMockItem({ term: "Zeta", band: "unmapped", candidate_label: null, candidate_uri: null }),
      getMockItem({ term: "Alpha", band: "rejected" }),
      getMockItem({ term: "Beta", band: "review" }),
      getMockItem({ term: "Gamma", band: "auto" }),
    ];
    const rows = buildTermsTable(items, []);
    expect(rows.map((r) => r.term)).toEqual(["Gamma", "Beta", "Alpha", "Zeta"]);
  });

  it("breaks ties within the same band alphabetically by term", () => {
    const items = [
      getMockItem({ term: "Zebra", band: "auto" }),
      getMockItem({ term: "Anchor", band: "auto" }),
    ];
    const rows = buildTermsTable(items, []);
    expect(rows.map((r) => r.term)).toEqual(["Anchor", "Zebra"]);
  });
});

describe("buildAlignmentGraph", () => {
  it("returns no nodes or edges for no items", () => {
    expect(buildAlignmentGraph([], [])).toEqual({ nodes: [], edges: [] });
  });

  it("never fabricates a FIBO edge for a term with no alignment candidate", () => {
    const items = [getMockItem({ term: "Settlement Venue", band: "unmapped", candidate_label: null, candidate_uri: null })];
    const graph = buildAlignmentGraph(items, []);
    expect(graph.edges.some((e) => e.type === "ALIGNS_TO")).toBe(false);
  });

  it("creates one shared FIBO node when two terms align to the same class, not a duplicate", () => {
    const items = [
      getMockItem({ term: "Trade", candidate_uri: "https://fibo/Trade", candidate_label: "fibo:Trade" }),
      getMockItem({ term: "Trade Status", candidate_uri: "https://fibo/Trade", candidate_label: "fibo:Trade" }),
    ];
    const graph = buildAlignmentGraph(items, []);
    const fiboNodes = graph.nodes.filter((n) => n.label === "FIBO");
    expect(fiboNodes).toHaveLength(1);
  });

  it("creates one shared Entity node when two terms share a source table, not a duplicate", () => {
    const items = [getMockItem({ term: "Trade" }), getMockItem({ term: "Trade Status" })];
    const glossary = [
      getMockGlossaryEntry({ term: "Trade", source_tables: ["trades"] }),
      getMockGlossaryEntry({ term: "Trade Status", source_tables: ["trades"] }),
    ];
    const graph = buildAlignmentGraph(items, glossary);
    const entityNodes = graph.nodes.filter((n) => n.label === "Entity");
    expect(entityNodes).toHaveLength(1);
  });

  it("connects FIBO to Term and Term to Entity with real, distinct relationship types", () => {
    const items = [getMockItem({ term: "Trade" })];
    const glossary = [getMockGlossaryEntry({ term: "Trade", source_tables: ["trades"] })];
    const graph = buildAlignmentGraph(items, glossary);
    expect(graph.edges).toHaveLength(2);
    expect(graph.edges.some((e) => e.type === "ALIGNS_TO")).toBe(true);
    expect(graph.edges.some((e) => e.type === "DESCRIBES")).toBe(true);
  });

  it("assigns a unique id to every node, even across FIBO/Term/Entity types sharing one counter", () => {
    const items = [
      getMockItem({ term: "Trade", candidate_uri: "https://fibo/Trade", candidate_label: "fibo:Trade" }),
      getMockItem({ term: "Notional", candidate_uri: "https://fibo/Notional", candidate_label: "fibo:Notional" }),
    ];
    const glossary = [
      getMockGlossaryEntry({ term: "Trade", source_tables: ["trades"] }),
      getMockGlossaryEntry({ term: "Notional", source_tables: ["positions"] }),
    ];
    const graph = buildAlignmentGraph(items, glossary);
    const ids = graph.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses the candidate URI as the FIBO node's name when no candidate label is present", () => {
    const items = [getMockItem({ candidate_label: null, candidate_uri: "https://fibo/X" })];
    const graph = buildAlignmentGraph(items, []);
    const fibo = graph.nodes.find((n) => n.label === "FIBO");
    expect(fibo?.name).toBe("https://fibo/X");
  });

  it("creates one Term node even if the same term appears twice in the items list", () => {
    const items = [getMockItem({ term: "Trade" }), getMockItem({ term: "Trade" })];
    const graph = buildAlignmentGraph(items, []);
    expect(graph.nodes.filter((n) => n.label === "Term")).toHaveLength(1);
  });

  it("gives the Term node the term's real name", () => {
    const graph = buildAlignmentGraph([getMockItem({ term: "Trade" })], []);
    const termNode = graph.nodes.find((n) => n.label === "Term");
    expect(termNode?.name).toBe("Trade");
  });

  it("creates no Entity nodes when the term has no matching glossary entry", () => {
    const graph = buildAlignmentGraph([getMockItem({ term: "Orphan" })], []);
    expect(graph.nodes.filter((n) => n.label === "Entity")).toHaveLength(0);
  });
});
