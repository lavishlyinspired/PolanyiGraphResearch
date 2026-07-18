import { describe, expect, test } from "vitest";
import { governingRules } from "./governingRules";
import { glossaryEntrySchema, type GlossaryEntry, type Rule } from "@/api/context";
import { ruleSchema } from "@/api/validation";

function makeTerm(overrides: Partial<GlossaryEntry> = {}): GlossaryEntry {
  return glossaryEntrySchema.parse({
    term: "Notional Amount",
    definition: "Face value of a trade",
    formula: null,
    source_tables: ["trades"],
    source_columns: ["notional_amount"],
    unit: null,
    synonyms: [],
    ontology_class: null,
    ontology_uri: null,
    ...overrides,
  });
}

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return ruleSchema.parse({
    rule_id: "BR-001",
    name: "Sanctioned Counterparty Check",
    description: "Exclude sanctioned counterparties.",
    severity: "CRITICAL",
    affected_entities: ["trades", "counterparties"],
    ...overrides,
  });
}

describe("governingRules", () => {
  test("returns rules whose affected_entities intersects the term's source_tables", () => {
    const term = makeTerm({ source_tables: ["trades"] });
    const rule = makeRule({ affected_entities: ["trades", "counterparties"] });
    expect(governingRules(term, [rule])).toEqual([rule]);
  });

  test("excludes rules that do not touch any of the term's source tables", () => {
    const term = makeTerm({ source_tables: ["counterparties"] });
    const rule = makeRule({ rule_id: "BR-002", affected_entities: ["trades"] });
    expect(governingRules(term, [rule])).toEqual([]);
  });

  test("a term spanning multiple tables matches a rule touching only one of them", () => {
    const term = makeTerm({ source_tables: ["trades", "fx_rates"] });
    const rule = makeRule({ rule_id: "BR-004", affected_entities: ["fx_rates"] });
    expect(governingRules(term, [rule])).toEqual([rule]);
  });

  test("returns an empty list when the term has no source tables", () => {
    const term = makeTerm({ source_tables: [] });
    const rule = makeRule();
    expect(governingRules(term, [rule])).toEqual([]);
  });

  test("preserves the order rules were given in", () => {
    const term = makeTerm({ source_tables: ["trades"] });
    const first = makeRule({ rule_id: "BR-001", affected_entities: ["trades"] });
    const second = makeRule({ rule_id: "BR-002", affected_entities: ["trades"] });
    expect(governingRules(term, [first, second]).map((r) => r.rule_id)).toEqual([
      "BR-001",
      "BR-002",
    ]);
  });
});
