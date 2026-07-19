import { z } from "zod";

// Mirrors packages/semantic-runtime/semantic/documents.py (ExtractedMention)
// and the POST /api/documents/ingest response shape.
export const documentMentionSchema = z.object({
  text: z.string(),
  entity_type: z.string(),
  context: z.string().default(""),
  resolved_term: z.string().nullable().default(null),
});

export const ingestDocumentResultSchema = z.object({
  mentions: z.array(documentMentionSchema).default([]),
  triples: z.number(),
  extractor: z.string(),
  published_uri: z.string().nullable().default(null),
});

export type DocumentMention = z.infer<typeof documentMentionSchema>;
export type IngestDocumentResult = z.infer<typeof ingestDocumentResultSchema>;

/** SHACL held the extraction back — the endpoint returns 422 with the real
 *  validation report rather than silently accepting malformed RDF. */
export class ShaclValidationError extends Error {}

export async function ingestDocument(text: string, title: string): Promise<IngestDocumentResult> {
  const response = await fetch("/api/documents/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, title: title.trim() === "" ? null : title }),
  });
  if (response.status === 422) {
    const body: unknown = await response.json();
    const detail =
      typeof body === "object" && body !== null && "detail" in body && typeof body.detail === "string"
        ? body.detail
        : "SHACL validation failed";
    throw new ShaclValidationError(detail);
  }
  if (!response.ok) {
    throw new Error(`Ingest request failed with status ${response.status}`);
  }
  return ingestDocumentResultSchema.parse(await response.json());
}
