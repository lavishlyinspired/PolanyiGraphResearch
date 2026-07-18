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
  uri: z.string(),
  table_count: z.number(),
  status: z.string(),
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

export async function fetchSchema(): Promise<SchemaSnapshot> {
  const response = await fetch("/api/schema");
  if (!response.ok) {
    throw new Error(`Schema request failed with status ${response.status}`);
  }
  return schemaSnapshotSchema.parse(await response.json());
}
