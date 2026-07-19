import { z } from "zod";

// Mirrors packages/common/models.py (OntologyCandidate/AlignmentReviewItem/AlignmentQueue).
export const alignmentBandSchema = z.enum(["auto", "review", "rejected", "unmapped"]);

export const ontologyCandidateSchema = z.object({
  uri: z.string(),
  label: z.string(),
  definition: z.string().default(""),
  score: z.number(),
  method: z.enum(["lexical", "embedding"]).default("lexical"),
  rationale: z.string().default(""),
});

export const alignmentReviewItemSchema = z.object({
  term: z.string(),
  band: alignmentBandSchema,
  candidate_label: z.string().nullable().default(null),
  candidate_uri: z.string().nullable().default(null),
  score: z.number(),
  candidates: z.array(ontologyCandidateSchema).default([]),
});

export const alignmentQueueSchema = z.object({
  items: z.array(alignmentReviewItemSchema).default([]),
});

export type AlignmentBand = z.infer<typeof alignmentBandSchema>;
export type OntologyCandidate = z.infer<typeof ontologyCandidateSchema>;
export type AlignmentReviewItem = z.infer<typeof alignmentReviewItemSchema>;
export type AlignmentQueue = z.infer<typeof alignmentQueueSchema>;

/** The alignment queue depends on a reachable GraphDB; the endpoint returns 503
 *  when it isn't configured or reachable. Distinguished so the page can show an
 *  honest "requires GraphDB" state rather than a generic failure. */
export class GraphDBUnavailableError extends Error {}

export async function fetchAlignmentQueue(): Promise<AlignmentQueue> {
  const response = await fetch("/api/context/align/queue");
  if (response.status === 503) {
    throw new GraphDBUnavailableError("GraphDB is required for ontology alignment.");
  }
  if (!response.ok) {
    throw new Error(`Alignment queue request failed with status ${response.status}`);
  }
  return alignmentQueueSchema.parse(await response.json());
}

/** Accept a term's candidate — the algorithmically-best one by default, or a
 *  specific alternative from its top-N list when `candidateUri` is given.
 *  Returns the recomputed queue (the term moves into the aligned band). */
export async function acceptAlignment(term: string, candidateUri?: string): Promise<AlignmentQueue> {
  const response = await fetch(`/api/context/align/${encodeURIComponent(term)}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidate_uri: candidateUri ?? null }),
  });
  if (!response.ok) {
    throw new Error(`Accept request failed with status ${response.status}`);
  }
  return alignmentQueueSchema.parse(await response.json());
}

/** Reject a term's candidate — the algorithmically-best one by default, or a
 *  specific alternative from its top-N list when `candidateUri` is given.
 *  Returns the recomputed queue (the term moves into the rejected band). */
export async function rejectAlignment(term: string, candidateUri?: string): Promise<AlignmentQueue> {
  const response = await fetch(`/api/context/align/${encodeURIComponent(term)}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidate_uri: candidateUri ?? null }),
  });
  if (!response.ok) {
    throw new Error(`Reject request failed with status ${response.status}`);
  }
  return alignmentQueueSchema.parse(await response.json());
}

// Mirrors packages/semantic-runtime/semantic/owl.py (OwlClassInfo/ReasonerResult).
export const owlClassInfoSchema = z.object({
  iri: z.string(),
  label: z.string(),
});

export const reasonerResultSchema = z.object({
  ran: z.boolean(),
  consistent: z.boolean().nullable().default(null),
  detail: z.string().default(""),
});

export const ontologyHierarchySchema = z.object({
  class: z.string(),
  ancestors: z.array(owlClassInfoSchema).default([]),
  descendants: z.array(owlClassInfoSchema).default([]),
  reasoner: reasonerResultSchema,
});

export type OwlClassInfo = z.infer<typeof owlClassInfoSchema>;
export type ReasonerResult = z.infer<typeof reasonerResultSchema>;
export type OntologyHierarchy = z.infer<typeof ontologyHierarchySchema>;

/** Ancestors/descendants (real GraphDB subclass-neighborhood export) plus
 *  HermiT consistency status for one FIBO class — degrades honestly
 *  (`reasoner.ran: false`) when no Java runtime is available, never fakes
 *  a consistency result. */
export async function fetchOntologyHierarchy(uri: string): Promise<OntologyHierarchy> {
  const response = await fetch(`/api/ontology/reason?uri=${encodeURIComponent(uri)}`);
  if (response.status === 503) {
    throw new GraphDBUnavailableError("GraphDB is required for ontology reasoning.");
  }
  if (!response.ok) {
    throw new Error(`Hierarchy request failed with status ${response.status}`);
  }
  return ontologyHierarchySchema.parse(await response.json());
}
