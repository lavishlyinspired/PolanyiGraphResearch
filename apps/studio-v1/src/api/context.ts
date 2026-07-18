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

export const semanticContextSchema = z.object({
  domain: z.string(),
  glossary: z.array(glossaryEntrySchema).default([]),
  business_rules: z.array(ruleSchema).default([]),
  key_entities: z.array(z.string()).default([]),
  generated_by: z.enum(["deterministic", "llm"]),
});

export type GlossaryEntry = z.infer<typeof glossaryEntrySchema>;
export type SemanticContext = z.infer<typeof semanticContextSchema>;
export type { Rule } from "@/api/validation";

export async function fetchContext(): Promise<SemanticContext> {
  const response = await fetch("/api/context");
  if (!response.ok) {
    throw new Error(`Context request failed with status ${response.status}`);
  }
  return semanticContextSchema.parse(await response.json());
}
