import { z } from "zod";
import { ruleSchema } from "@/api/validation";

// Mirrors packages/common/models.py (GlossaryEntry) — GET /api/context.
// Note: the real backend model carries no per-term provenance field
// (no schema-derived / LLM-enriched / declared marker) — do not fabricate one.
export const glossaryEntrySchema = z.object({
  term: z.string(),
  definition: z.string(),
  formula: z.string().nullable().default(null),
  source_tables: z.array(z.string()).default([]),
  source_columns: z.array(z.string()).default([]),
  unit: z.string().nullable().default(null),
  synonyms: z.array(z.string()).default([]),
  ontology_class: z.string().nullable().default(null),
  ontology_uri: z.string().nullable().default(null),
});

// Mirrors packages/common/models.py (EntityRelationship).
export const entityRelationshipSchema = z.object({
  from_entity: z.string(),
  to_entity: z.string(),
  relationship_type: z.string(),
  foreign_key: z.string(),
  description: z.string(),
});

export const semanticContextSchema = z.object({
  domain: z.string(),
  glossary: z.array(glossaryEntrySchema).default([]),
  relationships: z.array(entityRelationshipSchema).default([]),
  business_rules: z.array(ruleSchema).default([]),
  key_entities: z.array(z.string()).default([]),
  generated_by: z.enum(["deterministic", "llm"]),
});

export type GlossaryEntry = z.infer<typeof glossaryEntrySchema>;
export type EntityRelationship = z.infer<typeof entityRelationshipSchema>;
export type SemanticContext = z.infer<typeof semanticContextSchema>;
export type { Rule } from "@/api/validation";

export async function fetchContext(): Promise<SemanticContext> {
  const response = await fetch("/api/context");
  if (!response.ok) {
    throw new Error(`Context request failed with status ${response.status}`);
  }
  return semanticContextSchema.parse(await response.json());
}

export async function regenerateContext(): Promise<SemanticContext> {
  const response = await fetch("/api/context/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Deterministic engine only: the backend default (use_llm=true) resolves a
    // real LLM client with no request-scoped timeout, so if that provider is
    // unreachable this call hangs indefinitely with no feedback to the user.
    // The deterministic engine always succeeds fast and is the documented
    // LLM-optional default — LLM enrichment is a separate, explicit opt-in.
    body: JSON.stringify({ use_llm: false }),
  });
  if (!response.ok) {
    throw new Error(`Generate context failed with status ${response.status}`);
  }
  return semanticContextSchema.parse(await response.json());
}
