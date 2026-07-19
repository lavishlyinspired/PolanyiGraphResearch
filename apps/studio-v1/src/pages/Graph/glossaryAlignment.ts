import type { AlignmentBand, AlignmentReviewItem } from "@/api/ontology";
import type { GlossaryEntry } from "@/api/context";
import type { GraphEdge, GraphNode } from "@/api/graph";

export type AlignmentStats = { auto: number; review: number; rejected: number; unmapped: number };

export function alignmentStats(items: AlignmentReviewItem[]): AlignmentStats {
  const stats: AlignmentStats = { auto: 0, review: 0, rejected: 0, unmapped: 0 };
  for (const item of items) {
    stats[item.band] += 1;
  }
  return stats;
}

export type TermAlignmentRow = {
  term: string;
  band: AlignmentBand;
  candidateLabel: string | null;
  candidateUri: string | null;
  score: number;
  sourceTables: string[];
};

const BAND_ORDER: AlignmentBand[] = ["auto", "review", "rejected", "unmapped"];

function bandRank(band: AlignmentBand): number {
  return BAND_ORDER.indexOf(band);
}

export function buildTermsTable(items: AlignmentReviewItem[], glossary: GlossaryEntry[]): TermAlignmentRow[] {
  const glossaryByTerm = new Map(glossary.map((entry) => [entry.term, entry]));
  return [...items]
    .sort((a, b) => {
      const rankDiff = bandRank(a.band) - bandRank(b.band);
      return rankDiff !== 0 ? rankDiff : a.term.localeCompare(b.term);
    })
    .map((item) => ({
      term: item.term,
      band: item.band,
      candidateLabel: item.candidate_label,
      candidateUri: item.candidate_uri,
      score: item.score,
      sourceTables: glossaryByTerm.get(item.term)?.source_tables ?? [],
    }));
}

export function buildAlignmentGraph(items: AlignmentReviewItem[], glossary: GlossaryEntry[]): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  const glossaryByTerm = new Map(glossary.map((entry) => [entry.term, entry]));
  const fiboIdByUri = new Map<string, number>();
  const termIdByTerm = new Map<string, number>();
  const entityIdByTable = new Map<string, number>();
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let nextId = 1;

  for (const item of items) {
    let fiboId: number | undefined;
    if (item.candidate_uri !== null) {
      fiboId = fiboIdByUri.get(item.candidate_uri);
      if (fiboId === undefined) {
        fiboId = nextId++;
        fiboIdByUri.set(item.candidate_uri, fiboId);
        nodes.push({ id: fiboId, label: "FIBO", name: item.candidate_label ?? item.candidate_uri, properties: {} });
      }
    }

    let termId = termIdByTerm.get(item.term);
    if (termId === undefined) {
      termId = nextId++;
      termIdByTerm.set(item.term, termId);
      nodes.push({ id: termId, label: "Term", name: item.term, properties: {} });
    }

    if (fiboId !== undefined) {
      edges.push({ source: fiboId, target: termId, type: "ALIGNS_TO" });
    }

    for (const table of glossaryByTerm.get(item.term)?.source_tables ?? []) {
      let entityId = entityIdByTable.get(table);
      if (entityId === undefined) {
        entityId = nextId++;
        entityIdByTable.set(table, entityId);
        nodes.push({ id: entityId, label: "Entity", name: table, properties: {} });
      }
      edges.push({ source: termId, target: entityId, type: "DESCRIBES" });
    }
  }

  return { nodes, edges };
}
