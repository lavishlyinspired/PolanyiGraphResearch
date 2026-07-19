import { z } from "zod";
import { Neo4jUnavailableError } from "@/api/health";

export const graphNodeSchema = z.object({
  id: z.number(),
  label: z.string(),
  name: z.string(),
  properties: z.record(z.string(), z.unknown()).default({}),
});

export const graphEdgeSchema = z.object({
  source: z.number(),
  target: z.number(),
  type: z.string(),
});

export const graphExploreSchema = z.object({
  nodes: z.array(graphNodeSchema).default([]),
  edges: z.array(graphEdgeSchema).default([]),
});

export const materializeResultSchema = z.object({
  entities: z.number(),
  terms: z.number(),
  relationships: z.number(),
});

export type GraphNode = z.infer<typeof graphNodeSchema>;
export type GraphEdge = z.infer<typeof graphEdgeSchema>;
export type GraphExplore = z.infer<typeof graphExploreSchema>;
export type MaterializeResult = z.infer<typeof materializeResultSchema>;

export { Neo4jUnavailableError };

export async function fetchGraphExplore(): Promise<GraphExplore> {
  const response = await fetch("/api/graph/explore");
  if (response.status === 503) {
    throw new Neo4jUnavailableError("Neo4j is required to explore the knowledge graph.");
  }
  if (!response.ok) {
    throw new Error(`Graph explore request failed with status ${response.status}`);
  }
  return graphExploreSchema.parse(await response.json());
}

export async function materializeGraph(): Promise<MaterializeResult> {
  const response = await fetch("/api/graph/materialize", { method: "POST" });
  if (response.status === 503) {
    throw new Neo4jUnavailableError("Neo4j is required to materialize the knowledge graph.");
  }
  if (!response.ok) {
    throw new Error(`Materialize request failed with status ${response.status}`);
  }
  return materializeResultSchema.parse(await response.json());
}
