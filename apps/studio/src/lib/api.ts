// Typed client for the GraphOS API. Every getter returns null when the API
// is unreachable so views can fall back to bundled demo data.

export type ApiHealth = {
  status: string;
  version: string;
  llm_mode: "llm" | "deterministic";
  db_uri: string;
};

export type ApiSource = {
  name: string;
  dialect: string;
  uri: string;
  table_count: number;
  status: string;
};

export type ApiColumn = {
  name: string;
  type: string;
  nullable: boolean;
  primary_key: boolean;
};

export type ApiForeignKey = {
  column: string;
  references_table: string;
  references_column: string;
};

export type ApiTable = {
  name: string;
  columns: ApiColumn[];
  foreign_keys: ApiForeignKey[];
};

export type ApiSchema = {
  dialect: string;
  tables: ApiTable[];
};

export type ApiGlossaryEntry = {
  term: string;
  definition: string;
  formula: string | null;
  source_tables: string[];
  source_columns: string[];
  unit: string | null;
  synonyms: string[];
  ontology_class: string | null;
  ontology_uri: string | null;
};

export type ApiRelationship = {
  from_entity: string;
  to_entity: string;
  relationship_type: string;
  foreign_key: string;
  description: string;
};

export type ApiBusinessRule = {
  rule_id: string;
  name: string;
  description: string;
  sql_hints: string[];
  affected_entities: string[];
  severity: string;
};

export type ApiContext = {
  domain: string;
  glossary: ApiGlossaryEntry[];
  relationships: ApiRelationship[];
  business_rules: ApiBusinessRule[];
  key_entities: string[];
  common_queries: string[];
  generated_by: "deterministic" | "llm";
};

export type ApiAskStep = {
  kind: "tool_call" | "tool_result" | "validation" | "answer";
  name: string;
  detail: string;
};

export type ApiAskResult = {
  question: string;
  answer: string;
  steps: ApiAskStep[];
};

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const getHealth = () => getJson<ApiHealth>("/api/health");
export const getSources = () => getJson<ApiSource[]>("/api/sources");
export const getSchema = () => getJson<ApiSchema>("/api/schema");
export const getContext = () => getJson<ApiContext>("/api/context");

export type ApiCapability = {
  capability: string;
  name: string;
  kind: string;
  description: string;
  metadata: Record<string, unknown>;
};

export type ApiOntologyCandidate = {
  uri: string;
  label: string;
  definition: string;
  score: number;
};

export type ApiReasoning = {
  class: string;
  ancestors: { iri: string; label: string }[];
  descendants: { iri: string; label: string }[];
  reasoner: { ran: boolean; consistent: boolean | null; detail: string };
};

export type ApiMention = {
  text: string;
  entity_type: string;
  context: string;
  resolved_term: string | null;
};

export type ApiIngestResult = {
  mentions: ApiMention[];
  triples: number;
};

export const getCapabilities = () => getJson<ApiCapability[]>("/api/capabilities");

export const searchOntology = (q: string) =>
  getJson<ApiOntologyCandidate[]>(`/api/ontology/search?q=${encodeURIComponent(q)}`);

export const reasonOntology = (uri: string) =>
  getJson<ApiReasoning>(`/api/ontology/reason?uri=${encodeURIComponent(uri)}`);

export async function ingestDocumentText(
  text: string,
  title: string
): Promise<ApiIngestResult | null> {
  try {
    const res = await fetch("/api/documents/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, title }),
    });
    if (!res.ok) return null;
    return (await res.json()) as ApiIngestResult;
  } catch {
    return null;
  }
}

export class AskError extends Error {}

export async function ask(question: string, sessionId?: string): Promise<ApiAskResult> {
  let res: Response;
  try {
    res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, session_id: sessionId ?? null }),
    });
  } catch {
    throw new AskError(
      "GraphOS API is not reachable. Start it with `graphos serve` and reload."
    );
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new AskError(body?.detail ?? `Request failed with status ${res.status}`);
  }
  return (await res.json()) as ApiAskResult;
}
