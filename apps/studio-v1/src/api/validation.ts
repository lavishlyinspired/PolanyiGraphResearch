import { z } from "zod";

// Mirrors packages/common/models.py (Violation / ValidationResult) at the trust boundary.
export const violationSchema = z.object({
  rule_id: z.string(),
  severity: z.string(),
  message: z.string(),
});

export const validationResultSchema = z.object({
  valid: z.boolean(),
  violations: z.array(violationSchema).default([]),
  checked_rules: z.array(z.string()).default([]),
});

// Mirrors packages/common/models.py (BusinessRuleContext) — GET /api/rules.
export const ruleSchema = z.object({
  rule_id: z.string(),
  name: z.string(),
  description: z.string(),
  severity: z.string().default("INFO"),
  sql_hints: z.array(z.string()).default([]),
  affected_entities: z.array(z.string()).default([]),
});

export const rulesSchema = z.array(ruleSchema);

// Mirrors packages/common/models.py (SqlExecutionResult) — POST /api/sql/execute.
export const sqlExecutionResultSchema = z.object({
  validation: validationResultSchema,
  columns: z.array(z.string()).default([]),
  rows: z.array(z.record(z.unknown())).default([]),
});

export type Violation = z.infer<typeof violationSchema>;
export type ValidationResult = z.infer<typeof validationResultSchema>;
export type Rule = z.infer<typeof ruleSchema>;
export type SqlExecutionResult = z.infer<typeof sqlExecutionResultSchema>;

export async function validateSql(sql: string): Promise<ValidationResult> {
  const response = await fetch("/api/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql }),
  });
  if (!response.ok) {
    throw new Error(`Validation request failed with status ${response.status}`);
  }
  return validationResultSchema.parse(await response.json());
}

export async function fetchRules(): Promise<Rule[]> {
  const response = await fetch("/api/rules");
  if (!response.ok) {
    throw new Error(`Rules request failed with status ${response.status}`);
  }
  return rulesSchema.parse(await response.json());
}

export async function executeSql(sql: string): Promise<SqlExecutionResult> {
  const response = await fetch("/api/sql/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql }),
  });
  if (!response.ok) {
    throw new Error(`Execute request failed with status ${response.status}`);
  }
  return sqlExecutionResultSchema.parse(await response.json());
}

export const cypherResultSchema = z.object({
  rows: z.array(z.record(z.unknown())).default([]),
});

export type CypherResult = z.infer<typeof cypherResultSchema>;

export class RejectedCypherError extends Error {}

export async function runCypher(query: string): Promise<CypherResult> {
  const response = await fetch("/api/graph/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (response.status === 400) {
    const body = z.object({ detail: z.string() }).parse(await response.json());
    throw new RejectedCypherError(body.detail);
  }
  if (!response.ok) {
    throw new Error(`Cypher request failed with status ${response.status}`);
  }
  return cypherResultSchema.parse(await response.json());
}

export const sparqlResultSchema = z.object({
  engine: z.enum(["graphdb", "local"]),
  rows: z.array(z.record(z.unknown())).default([]),
});

export type SparqlResult = z.infer<typeof sparqlResultSchema>;

export async function runSparql(query: string): Promise<SparqlResult> {
  const response = await fetch("/api/sparql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) {
    throw new Error(`SPARQL request failed with status ${response.status}`);
  }
  return sparqlResultSchema.parse(await response.json());
}
