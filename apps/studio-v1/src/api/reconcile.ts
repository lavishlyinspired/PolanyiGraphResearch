import { z } from "zod";

// Mirrors packages/common/models.py TaxonomyMatch.
export const taxonomyMatchSchema = z.object({
  source: z.string(),
  target: z.string(),
  confidence: z.number(),
  band: z.enum(["auto", "review", "rejected", "unmapped"]),
});

export const reconciliationResultSchema = z.object({
  source: z.string(),
  matches: z.array(taxonomyMatchSchema).default([]),
});

export type TaxonomyMatch = z.infer<typeof taxonomyMatchSchema>;
export type ReconciliationResult = z.infer<typeof reconciliationResultSchema>;

/** No connected source named this, or the two sources' glossaries couldn't be
 *  compared — distinguished so the panel can show which is true rather than
 *  a generic failure. */
export class UnknownReconciliationSourceError extends Error {}

export async function fetchReconciliation(source: string): Promise<ReconciliationResult> {
  const response = await fetch(`/api/context/reconcile?source=${encodeURIComponent(source)}`);
  if (response.status === 404) {
    throw new UnknownReconciliationSourceError(`No connected source named '${source}'.`);
  }
  if (!response.ok) {
    throw new Error(`Reconciliation request failed with status ${response.status}`);
  }
  return reconciliationResultSchema.parse(await response.json());
}

/** Promotes a review-band match to auto (or re-affirms one already there) —
 *  returns the recomputed match list. */
export async function acceptTaxonomyMatch(source: string, term: string): Promise<ReconciliationResult> {
  const response = await fetch(
    `/api/context/reconcile/${encodeURIComponent(source)}/${encodeURIComponent(term)}/accept`,
    { method: "POST" },
  );
  if (!response.ok) {
    throw new Error(`Accept request failed with status ${response.status}`);
  }
  return reconciliationResultSchema.parse(await response.json());
}

/** Demotes a match to rejected — precision over recall, same as ontology
 *  alignment's own reject. */
export async function rejectTaxonomyMatch(source: string, term: string): Promise<ReconciliationResult> {
  const response = await fetch(
    `/api/context/reconcile/${encodeURIComponent(source)}/${encodeURIComponent(term)}/reject`,
    { method: "POST" },
  );
  if (!response.ok) {
    throw new Error(`Reject request failed with status ${response.status}`);
  }
  return reconciliationResultSchema.parse(await response.json());
}

export const publishResultSchema = z.object({
  named_graph: z.string(),
  triples: z.number(),
  published_matches: z.number(),
});

export type PublishResult = z.infer<typeof publishResultSchema>;

export class GraphDBUnavailableError extends Error {}

/** Publishes every auto-band match as a real skos:exactMatch triple to a
 *  per-source-pair GraphDB named graph. A review-band guess is never
 *  auto-published — only accept moves a match into the auto band first. */
export async function publishTaxonomyMatches(source: string): Promise<PublishResult> {
  const response = await fetch(`/api/context/reconcile/${encodeURIComponent(source)}/publish`, {
    method: "POST",
  });
  if (response.status === 503) {
    throw new GraphDBUnavailableError("GraphDB is required to publish taxonomy matches.");
  }
  if (!response.ok) {
    throw new Error(`Publish request failed with status ${response.status}`);
  }
  return publishResultSchema.parse(await response.json());
}
