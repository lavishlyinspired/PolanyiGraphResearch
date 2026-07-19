import { describe, expect, it } from "vitest";
import { buildPipelineStages, traceFromEvent } from "./lineagePipeline";
import type { SchemaSnapshot } from "@/api/schema";
import type { SemanticContext, GlossaryEntry } from "@/api/context";
import type { AlignmentQueue } from "@/api/ontology";
import type { Rule } from "@/api/validation";
import type { SessionSummary } from "@/api/agent";
import type { EnforcementEvent } from "@/api/compliance";

function getMockSchema(overrides?: Partial<SchemaSnapshot>): SchemaSnapshot {
  return {
    dialect: "sqlite",
    tables: [
      { name: "trades", columns: [], foreign_keys: [{ column: "counterparty_id", references_table: "counterparties", references_column: "id" }] },
      { name: "counterparties", columns: [], foreign_keys: [] },
    ],
    ...overrides,
  };
}

function getMockGlossaryEntry(overrides?: Partial<GlossaryEntry>): GlossaryEntry {
  return {
    term: "Counterparty",
    definition: "d",
    formula: null,
    source_tables: ["counterparties"],
    source_columns: [],
    unit: null,
    synonyms: [],
    ontology_class: null,
    ontology_uri: "https://fibo/Counterparty",
    ...overrides,
  };
}

function getMockContext(overrides?: Partial<SemanticContext>): SemanticContext {
  return {
    domain: "Financial Services",
    glossary: [getMockGlossaryEntry()],
    relationships: [{ from_entity: "trades", to_entity: "counterparties", relationship_type: "FK", foreign_key: "counterparty_id", description: "d" }],
    business_rules: [],
    key_entities: ["trades", "counterparties"],
    generated_by: "deterministic",
    ...overrides,
  };
}

function getMockAlignmentQueue(overrides?: Partial<AlignmentQueue>): AlignmentQueue {
  return {
    items: [
      { term: "Counterparty", band: "auto", candidate_label: "fibo:Counterparty", candidate_uri: "https://fibo/Counterparty", score: 0.95, candidates: [] },
      { term: "Trade", band: "review", candidate_label: null, candidate_uri: null, score: 0.6, candidates: [] },
    ],
    ...overrides,
  };
}

function getMockRule(overrides?: Partial<Rule>): Rule {
  return { rule_id: "BR-001", name: "Sanctioned Check", description: "d", severity: "CRITICAL", sql_hints: [], affected_entities: ["counterparties"], ...overrides };
}

function getMockSession(overrides?: Partial<SessionSummary>): SessionSummary {
  return { session_id: "s1", turn_count: 2, last_message: "hi", updated_at: "t", ...overrides };
}

describe("buildPipelineStages", () => {
  it("reports real schema table and foreign-key counts", () => {
    const stages = buildPipelineStages({
      schema: getMockSchema(),
      context: getMockContext({ glossary: [], key_entities: [], relationships: [] }),
      alignment: null,
      rules: [],
      sessions: [],
    });
    const schemaStage = stages.find((s) => s.title === "Schema");
    expect(schemaStage?.value).toBe("2 tables");
    expect(schemaStage?.sub).toBe("1 foreign keys");
  });

  it("reports real entity and relationship counts from the context, not the schema", () => {
    const stages = buildPipelineStages({
      schema: getMockSchema({ tables: [] }),
      context: getMockContext(),
      alignment: null,
      rules: [],
      sessions: [],
    });
    const entitiesStage = stages.find((s) => s.title === "Entities");
    expect(entitiesStage?.value).toBe("2 entities");
    expect(entitiesStage?.sub).toBe("1 relationships");
  });

  it("reports real glossary term counts and how many are unmapped, not fabricated", () => {
    const stages = buildPipelineStages({
      schema: getMockSchema(),
      context: getMockContext({
        glossary: [
          getMockGlossaryEntry({ term: "A", ontology_uri: "x" }),
          getMockGlossaryEntry({ term: "B", ontology_uri: "y" }),
          getMockGlossaryEntry({ term: "C", ontology_uri: null }),
        ],
      }),
      alignment: null,
      rules: [],
      sessions: [],
    });
    const glossaryStage = stages.find((s) => s.title === "Glossary");
    expect(glossaryStage?.value).toBe("3 terms");
    expect(glossaryStage?.sub).toBe("1 unmapped");
  });

  it("reports the FIBO stage as unavailable rather than fabricating zero when GraphDB wasn't reachable", () => {
    const stages = buildPipelineStages({ schema: getMockSchema(), context: getMockContext(), alignment: null, rules: [], sessions: [] });
    const fiboStage = stages.find((s) => s.title === "FIBO");
    expect(fiboStage?.value).toBe("unavailable");
    expect(fiboStage?.sub).toBe("requires GraphDB");
  });

  it("reports real auto-aligned and review counts from the alignment queue when available", () => {
    const stages = buildPipelineStages({
      schema: getMockSchema(),
      context: getMockContext(),
      alignment: getMockAlignmentQueue({
        items: [
          { term: "A", band: "auto", candidate_label: "x", candidate_uri: "x", score: 0.95, candidates: [] },
          { term: "B", band: "auto", candidate_label: "y", candidate_uri: "y", score: 0.95, candidates: [] },
          { term: "E", band: "auto", candidate_label: "z", candidate_uri: "z", score: 0.95, candidates: [] },
          { term: "C", band: "review", candidate_label: null, candidate_uri: null, score: 0.6, candidates: [] },
        ],
      }),
      rules: [],
      sessions: [],
    });
    const fiboStage = stages.find((s) => s.title === "FIBO");
    expect(fiboStage?.value).toBe("3 aligned");
    expect(fiboStage?.sub).toBe("1 review");
  });

  it("reports the real declared rule count and how many are real CRITICAL severity", () => {
    const stages = buildPipelineStages({
      schema: getMockSchema(),
      context: getMockContext(),
      alignment: null,
      rules: [
        getMockRule({ rule_id: "BR-001", severity: "CRITICAL" }),
        getMockRule({ rule_id: "BR-002", severity: "MEDIUM" }),
        getMockRule({ rule_id: "BR-003", severity: "CRITICAL" }),
      ],
      sessions: [],
    });
    const rulesStage = stages.find((s) => s.title === "Rules");
    expect(rulesStage?.value).toBe("3 rules");
    expect(rulesStage?.sub).toBe("2 critical");
  });

  it("reports the real session count and the real sum of turns across sessions, never fabricated", () => {
    const stages = buildPipelineStages({
      schema: getMockSchema(),
      context: getMockContext(),
      alignment: null,
      rules: [],
      sessions: [getMockSession({ turn_count: 2 }), getMockSession({ session_id: "s2", turn_count: 3 })],
    });
    const agentStage = stages.find((s) => s.title === "Agent");
    expect(agentStage?.value).toBe("2 sessions");
    expect(agentStage?.sub).toBe("5 turns");
  });
});

function getMockEvent(overrides?: Partial<EnforcementEvent>): EnforcementEvent {
  return {
    rule_id: "BR-001",
    verdict: "passed",
    sql: "SELECT t.trade_id FROM trades t JOIN counterparties c ON t.counterparty_id = c.counterparty_id",
    timestamp: "2026-07-19T12:00:00",
    source: "agent",
    ...overrides,
  };
}

describe("traceFromEvent", () => {
  it("finds only the real tables the SQL actually references", () => {
    const trace = traceFromEvent(getMockEvent(), getMockContext(), []);
    expect(trace.tables.sort()).toEqual(["counterparties", "trades"]);
  });

  it("never includes a table the SQL doesn't mention", () => {
    const trace = traceFromEvent(
      getMockEvent({ sql: "SELECT * FROM trades" }),
      getMockContext({ key_entities: ["trades", "positions"] }),
      [],
    );
    expect(trace.tables).toEqual(["trades"]);
  });

  it("derives real glossary terms whose source tables overlap the traced tables", () => {
    const trace = traceFromEvent(
      getMockEvent({ sql: "SELECT * FROM counterparties" }),
      getMockContext({ key_entities: [], glossary: [getMockGlossaryEntry({ term: "Counterparty", source_tables: ["counterparties"] })] }),
      [],
    );
    expect(trace.terms).toEqual(["Counterparty"]);
  });

  it("derives real rules whose affected entities overlap the traced tables", () => {
    const trace = traceFromEvent(
      getMockEvent({ sql: "SELECT * FROM counterparties" }),
      getMockContext({ key_entities: [], glossary: [] }),
      [getMockRule({ rule_id: "BR-001", affected_entities: ["counterparties"] })],
    );
    expect(trace.relatedRules).toEqual(["BR-001"]);
  });

  it("never derives a rule with no real table overlap", () => {
    const trace = traceFromEvent(
      getMockEvent({ sql: "SELECT * FROM counterparties" }),
      getMockContext({ key_entities: [], glossary: [] }),
      [getMockRule({ rule_id: "BR-002", affected_entities: ["trades"] })],
    );
    expect(trace.relatedRules).toEqual([]);
  });

  it("carries the real sql text through unchanged", () => {
    const trace = traceFromEvent(getMockEvent({ sql: "SELECT 1" }), getMockContext(), []);
    expect(trace.sql).toBe("SELECT 1");
  });

  it("matches a table name case-insensitively", () => {
    const trace = traceFromEvent(
      getMockEvent({ sql: "SELECT * FROM COUNTERPARTIES" }),
      getMockContext({ key_entities: ["counterparties"], glossary: [] }),
      [],
    );
    expect(trace.tables).toEqual(["counterparties"]);
  });

  it("never includes a term whose source tables don't overlap the traced tables at all", () => {
    const trace = traceFromEvent(
      getMockEvent({ sql: "SELECT * FROM counterparties" }),
      getMockContext({
        key_entities: [],
        glossary: [
          getMockGlossaryEntry({ term: "Counterparty", source_tables: ["counterparties"] }),
          getMockGlossaryEntry({ term: "Trade", source_tables: ["trades"] }),
        ],
      }),
      [],
    );
    expect(trace.terms).toEqual(["Counterparty"]);
  });

  it("derives a term when only one of its several source tables overlaps, not requiring all", () => {
    const trace = traceFromEvent(
      getMockEvent({ sql: "SELECT * FROM counterparties" }),
      getMockContext({
        key_entities: [],
        glossary: [getMockGlossaryEntry({ term: "Counterparty", source_tables: ["counterparties", "widgets"] })],
      }),
      [],
    );
    expect(trace.terms).toEqual(["Counterparty"]);
  });

  it("derives a rule when only one of its several affected entities overlaps, not requiring all", () => {
    const trace = traceFromEvent(
      getMockEvent({ sql: "SELECT * FROM counterparties" }),
      getMockContext({ key_entities: [], glossary: [] }),
      [getMockRule({ rule_id: "BR-001", affected_entities: ["counterparties", "widgets"] })],
    );
    expect(trace.relatedRules).toEqual(["BR-001"]);
  });
});
