import { z } from "zod";

// Mirrors packages/common/models.py (ColumnInfo/ForeignKeyInfo/TableInfo/SchemaSnapshot).
export const columnInfoSchema = z.object({
  name: z.string(),
  type: z.string(),
  nullable: z.boolean().default(true),
  primary_key: z.boolean().default(false),
});

export const foreignKeyInfoSchema = z.object({
  column: z.string(),
  references_table: z.string(),
  references_column: z.string(),
});

export const tableInfoSchema = z.object({
  name: z.string(),
  columns: z.array(columnInfoSchema).default([]),
  foreign_keys: z.array(foreignKeyInfoSchema).default([]),
});

export const schemaSnapshotSchema = z.object({
  dialect: z.string(),
  tables: z.array(tableInfoSchema).default([]),
});

export const sourceSchema = z.object({
  name: z.string(),
  dialect: z.string(),
  kind: z.string().default(""),
  uri: z.string(),
  table_count: z.number(),
  status: z.string(),
  last_introspected: z.string().nullable().default(null),
  objects_label: z.string().default(""),
  is_primary: z.boolean().default(false),
  removable: z.boolean().default(false),
  // Only ever set for the Databricks workspace connection — persisted so the
  // schema browser doesn't need its own catalog/schema picker.
  catalog: z.string().nullable().default(null),
  schema_name: z.string().nullable().default(null),
});

export const sourcesSchema = z.array(sourceSchema);

export type TableInfo = z.infer<typeof tableInfoSchema>;
export type SchemaSnapshot = z.infer<typeof schemaSnapshotSchema>;
export type Source = z.infer<typeof sourceSchema>;

export async function fetchSources(): Promise<Source[]> {
  const response = await fetch("/api/sources");
  if (!response.ok) {
    throw new Error(`Sources request failed with status ${response.status}`);
  }
  return sourcesSchema.parse(await response.json());
}

export async function fetchSchema(
  opts: { source?: string; name?: string; catalog?: string; schemaName?: string } = {},
): Promise<SchemaSnapshot> {
  const params = new URLSearchParams();
  if (opts.source) params.set("source", opts.source);
  if (opts.name) params.set("name", opts.name);
  if (opts.catalog) params.set("catalog", opts.catalog);
  if (opts.schemaName) params.set("schema_name", opts.schemaName);
  const qs = params.toString();
  const url = qs ? `/api/schema?${qs}` : "/api/schema";
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Schema request failed with status ${response.status}`);
  }
  return schemaSnapshotSchema.parse(await response.json());
}

async function errorDetail(response: Response, fallback: string): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  return body !== null && typeof body === "object" && "detail" in body && typeof body.detail === "string"
    ? body.detail
    : fallback;
}

export type ConnectSourceInput =
  | { name: string; kind: string; uri: string }
  | { name: string; kind: "databricks"; host: string; warehouseId: string; token: string };

export async function connectSource(input: ConnectSourceInput): Promise<Source[]> {
  const body =
    "uri" in input
      ? { name: input.name, kind: input.kind, uri: input.uri }
      : {
          name: input.name,
          kind: input.kind,
          host: input.host,
          warehouse_id: input.warehouseId,
          token: input.token,
        };
  const response = await fetch("/api/sources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await errorDetail(response, `Connect failed with status ${response.status}`));
  }
  return sourcesSchema.parse(await response.json());
}

export async function disconnectSource(name: string): Promise<Source[]> {
  const response = await fetch(`/api/sources/${encodeURIComponent(name)}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(`Disconnect failed with status ${response.status}`);
  }
  return sourcesSchema.parse(await response.json());
}

export async function introspectSource(name: string): Promise<Source[]> {
  const response = await fetch(`/api/sources/${encodeURIComponent(name)}/introspect`, { method: "POST" });
  if (!response.ok) {
    throw new Error(await errorDetail(response, `Introspect failed with status ${response.status}`));
  }
  return sourcesSchema.parse(await response.json());
}

export type EditSourceInput =
  | { uri: string }
  | { host: string; warehouseId: string; token: string }
  | { catalog: string; schemaName: string };

export async function editSource(name: string, input: EditSourceInput): Promise<Source[]> {
  const body =
    "catalog" in input
      ? { catalog: input.catalog, schema_name: input.schemaName }
      : "host" in input
        ? { host: input.host, warehouse_id: input.warehouseId, token: input.token }
        : { uri: input.uri };
  const response = await fetch(`/api/sources/${encodeURIComponent(name)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await errorDetail(response, `Edit failed with status ${response.status}`));
  }
  return sourcesSchema.parse(await response.json());
}

export const databricksStatusSchema = z.object({
  connected: z.boolean(),
  host: z.string(),
  catalogs: z.array(z.string()),
  error: z.string().nullable(),
});

export const databricksSchemasSchema = z.object({
  schemas: z.array(z.string()),
});

export type DatabricksStatus = z.infer<typeof databricksStatusSchema>;
export type DatabricksSchemas = z.infer<typeof databricksSchemasSchema>;

export async function fetchDatabricksStatus(): Promise<DatabricksStatus> {
  const response = await fetch("/api/databricks/status");
  if (!response.ok) {
    throw new Error(`Databricks status failed with ${response.status}`);
  }
  return databricksStatusSchema.parse(await response.json());
}

export async function fetchDatabricksSchemas(catalog: string): Promise<DatabricksSchemas> {
  const response = await fetch(`/api/databricks/schemas?catalog=${encodeURIComponent(catalog)}`);
  if (!response.ok) {
    throw new Error(`Databricks schemas failed with ${response.status}`);
  }
  return databricksSchemasSchema.parse(await response.json());
}
