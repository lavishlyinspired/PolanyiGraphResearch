import type { GraphEdge, GraphExplore, GraphNode } from "@/api/graph";
import type { Rule } from "@/api/validation";
import type { GlossaryEntry } from "@/api/context";

const DOCUMENT_PERSPECTIVE_LABELS = new Set(["Document", "Mention", "Term"]);

export function filterDocumentGraph(explore: GraphExplore): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes = explore.nodes.filter((n) => DOCUMENT_PERSPECTIVE_LABELS.has(n.label));
  const keepIds = new Set(nodes.map((n) => n.id));
  const edges = explore.edges.filter((e) => keepIds.has(e.source) && keepIds.has(e.target));
  return { nodes, edges };
}

export type DocumentSummaryRow = { document: string; mentions: number; resolved: number };

export function buildDocumentSummary(explore: GraphExplore): DocumentSummaryRow[] {
  const documents = explore.nodes.filter((n) => n.label === "Document");
  const mentionIdsByDoc = new Map<number, number[]>();
  for (const e of explore.edges) {
    if (e.type !== "MENTIONS") continue;
    const arr = mentionIdsByDoc.get(e.source) ?? [];
    arr.push(e.target);
    mentionIdsByDoc.set(e.source, arr);
  }
  const resolvedMentionIds = new Set(explore.edges.filter((e) => e.type === "REFERS_TO").map((e) => e.source));

  return documents.map((doc) => {
    const mentionIds = mentionIdsByDoc.get(doc.id) ?? [];
    const resolved = mentionIds.filter((id) => resolvedMentionIds.has(id)).length;
    return { document: doc.name, mentions: mentionIds.length, resolved };
  });
}

export type MentionChainRow = {
  document: string;
  mentionText: string;
  resolvedTerm: string | null;
  relatedRules: string[];
};

function relatedRulesForTerm(term: string, rules: Rule[], tablesByTerm: Map<string, Set<string>>): string[] {
  const tables = tablesByTerm.get(term);
  if (tables === undefined) return [];
  const matched: string[] = [];
  for (const rule of rules) {
    if (rule.affected_entities.some((table) => tables.has(table))) {
      matched.push(rule.rule_id);
    }
  }
  return matched;
}

export function buildMentionChains(explore: GraphExplore, rules: Rule[], glossary: GlossaryEntry[]): MentionChainRow[] {
  const tablesByTerm = new Map(glossary.map((g) => [g.term, new Set(g.source_tables)]));
  const documentNameById = new Map(explore.nodes.filter((n) => n.label === "Document").map((n) => [n.id, n.name]));
  const mentionById = new Map(explore.nodes.filter((n) => n.label === "Mention").map((n) => [n.id, n]));
  const termNameById = new Map(explore.nodes.filter((n) => n.label === "Term").map((n) => [n.id, n.name]));

  const termByMentionId = new Map<number, string>();
  for (const e of explore.edges) {
    if (e.type !== "REFERS_TO") continue;
    const term = termNameById.get(e.target);
    if (term !== undefined) termByMentionId.set(e.source, term);
  }

  const rows: MentionChainRow[] = [];
  for (const e of explore.edges) {
    if (e.type !== "MENTIONS") continue;
    const documentName = documentNameById.get(e.source);
    const mention = mentionById.get(e.target);
    if (documentName === undefined || mention === undefined) continue;
    const resolvedTerm = termByMentionId.get(mention.id) ?? null;
    rows.push({
      document: documentName,
      mentionText: String(mention.properties.text ?? mention.name),
      resolvedTerm,
      relatedRules: resolvedTerm === null ? [] : relatedRulesForTerm(resolvedTerm, rules, tablesByTerm),
    });
  }
  return rows;
}
