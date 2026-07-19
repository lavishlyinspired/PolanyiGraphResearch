import type { SchemaSnapshot } from "@/api/schema";
import type { SemanticContext } from "@/api/context";
import type { AlignmentQueue } from "@/api/ontology";
import type { Rule } from "@/api/validation";
import type { SessionSummary } from "@/api/agent";
import type { EnforcementEvent } from "@/api/compliance";

export type PipelineStage = { title: string; value: string; sub: string };

export function buildPipelineStages(input: {
  schema: SchemaSnapshot;
  context: SemanticContext;
  alignment: AlignmentQueue | null;
  rules: Rule[];
  sessions: SessionSummary[];
}): PipelineStage[] {
  const { schema, context, alignment, rules, sessions } = input;
  const foreignKeys = schema.tables.reduce((sum, t) => sum + t.foreign_keys.length, 0);
  const unmapped = context.glossary.filter((g) => g.ontology_uri === null).length;
  const totalTurns = sessions.reduce((sum, s) => sum + s.turn_count, 0);

  const fiboStage: PipelineStage =
    alignment === null
      ? { title: "FIBO", value: "unavailable", sub: "requires GraphDB" }
      : {
          title: "FIBO",
          value: `${alignment.items.filter((i) => i.band === "auto").length} aligned`,
          sub: `${alignment.items.filter((i) => i.band === "review").length} review`,
        };

  return [
    { title: "Schema", value: `${schema.tables.length} tables`, sub: `${foreignKeys} foreign keys` },
    { title: "Entities", value: `${context.key_entities.length} entities`, sub: `${context.relationships.length} relationships` },
    { title: "Glossary", value: `${context.glossary.length} terms`, sub: `${unmapped} unmapped` },
    fiboStage,
    { title: "Rules", value: `${rules.length} rules`, sub: `${rules.filter((r) => r.severity === "CRITICAL").length} critical` },
    { title: "Agent", value: `${sessions.length} sessions`, sub: `${totalTurns} turns` },
  ];
}

export type LineageTrace = {
  sql: string;
  tables: string[];
  terms: string[];
  relatedRules: string[];
};

export function traceFromEvent(event: EnforcementEvent, context: SemanticContext, rules: Rule[]): LineageTrace {
  const allTables = new Set([
    ...context.key_entities,
    ...context.glossary.flatMap((g) => g.source_tables),
    ...rules.flatMap((r) => r.affected_entities),
  ]);
  const tables = [...allTables].filter((table) => new RegExp(`\\b${table}\\b`, "i").test(event.sql));
  const tableSet = new Set(tables);

  const terms = context.glossary
    .filter((g) => g.source_tables.some((t) => tableSet.has(t)))
    .map((g) => g.term);
  const relatedRules = rules
    .filter((r) => r.affected_entities.some((t) => tableSet.has(t)))
    .map((r) => r.rule_id);

  return { sql: event.sql, tables, terms, relatedRules };
}
