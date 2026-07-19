import { z } from "zod";

export const serviceHealthSchema = z.object({
  configured: z.boolean(),
  available: z.boolean(),
});

export const healthSchema = z.object({
  status: z.string(),
  version: z.string(),
  llm_mode: z.enum(["llm", "deterministic"]),
  db_uri: z.string(),
  graphdb: serviceHealthSchema,
  neo4j: serviceHealthSchema,
});

export type ServiceHealth = z.infer<typeof serviceHealthSchema>;
export type Health = z.infer<typeof healthSchema>;

export async function fetchHealth(): Promise<Health> {
  const response = await fetch("/api/health");
  if (!response.ok) {
    throw new Error(`Health request failed with status ${response.status}`);
  }
  return healthSchema.parse(await response.json());
}

export const graphStatsSchema = z.object({
  nodes: z.number(),
  edges: z.number(),
  materialized_at: z.string().nullable().default(null),
});

export type GraphStats = z.infer<typeof graphStatsSchema>;

/** Knowledge graph stats depend on a reachable Neo4j; the endpoint returns 503
 *  when it isn't configured or reachable. Distinguished so the page can show
 *  an honest "requires Neo4j" state rather than a generic failure. */
export class Neo4jUnavailableError extends Error {}

export async function fetchGraphStats(): Promise<GraphStats> {
  const response = await fetch("/api/graph/stats");
  if (response.status === 503) {
    throw new Neo4jUnavailableError("Neo4j is required for knowledge graph stats.");
  }
  if (!response.ok) {
    throw new Error(`Graph stats request failed with status ${response.status}`);
  }
  return graphStatsSchema.parse(await response.json());
}
