import { describe, expect, it } from "vitest";
import { buildComplianceRows, buildRulesGraph } from "./complianceGraph";
import type { Rule } from "@/api/validation";
import type { RuleEnforcementSummary } from "@/api/compliance";

function getMockRule(overrides?: Partial<Rule>): Rule {
  return {
    rule_id: "BR-001",
    name: "Sanctioned Check",
    description: "Trades must exclude sanctioned counterparties.",
    severity: "CRITICAL",
    sql_hints: ["is_sanctioned"],
    affected_entities: ["trades", "counterparties"],
    ...overrides,
  };
}

describe("buildRulesGraph", () => {
  it("returns no nodes or edges for no rules", () => {
    expect(buildRulesGraph([])).toEqual({ nodes: [], edges: [] });
  });

  it("connects a rule to each of its real affected entities", () => {
    const graph = buildRulesGraph([getMockRule({ affected_entities: ["trades", "counterparties"] })]);
    expect(graph.edges).toHaveLength(2);
    expect(graph.edges.every((e) => e.type === "APPLIES_TO")).toBe(true);
  });

  it("creates one shared Entity node when two rules apply to the same entity, not a duplicate", () => {
    const rules = [
      getMockRule({ rule_id: "BR-001", affected_entities: ["trades"] }),
      getMockRule({ rule_id: "BR-002", affected_entities: ["trades"] }),
    ];
    const graph = buildRulesGraph(rules);
    expect(graph.nodes.filter((n) => n.label === "Entity")).toHaveLength(1);
  });

  it("never fabricates an edge to an entity the rule doesn't actually affect", () => {
    const graph = buildRulesGraph([getMockRule({ affected_entities: ["trades"] })]);
    expect(graph.edges.every((e) => e.type !== "APPLIES_TO" || graph.nodes.some((n) => n.label === "Entity" && n.name === "trades"))).toBe(true);
    expect(graph.nodes.filter((n) => n.label === "Entity")).toHaveLength(1);
  });

  it("carries the rule's real severity into the node's properties", () => {
    const graph = buildRulesGraph([getMockRule({ severity: "CRITICAL" })]);
    const ruleNode = graph.nodes.find((n) => n.label === "Rule");
    expect(ruleNode?.properties.severity).toBe("CRITICAL");
  });

  it("gives the Rule node the rule's real id as its name", () => {
    const graph = buildRulesGraph([getMockRule({ rule_id: "BR-004" })]);
    const ruleNode = graph.nodes.find((n) => n.label === "Rule");
    expect(ruleNode?.name).toBe("BR-004");
  });

  it("assigns a unique id to every node, even across Rule/Entity types sharing one counter", () => {
    const rules = [
      getMockRule({ rule_id: "BR-001", affected_entities: ["trades"] }),
      getMockRule({ rule_id: "BR-002", affected_entities: ["counterparties"] }),
    ];
    const graph = buildRulesGraph(rules);
    const ids = graph.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("buildComplianceRows", () => {
  it("returns no rows for no rules", () => {
    expect(buildComplianceRows([], [])).toEqual([]);
  });

  it("joins real passed/flagged/blocked counts from the summary", () => {
    const summary: RuleEnforcementSummary[] = [
      { rule_id: "BR-001", rule_name: "Sanctioned Check", passed: 3, flagged: 1, blocked: 2 },
    ];
    const rows = buildComplianceRows([getMockRule()], summary);
    expect(rows[0]).toMatchObject({ ruleId: "BR-001", passed: 3, flagged: 1, blocked: 2 });
  });

  it("defaults to 0/0/0 rather than fabricating a count for a rule with no enforcement history yet", () => {
    const rows = buildComplianceRows([getMockRule({ rule_id: "BR-999" })], []);
    expect(rows[0]).toMatchObject({ passed: 0, flagged: 0, blocked: 0 });
  });

  it("carries the rule's real affected entities and severity", () => {
    const rows = buildComplianceRows([getMockRule({ affected_entities: ["trades", "counterparties"], severity: "CRITICAL" })], []);
    expect(rows[0]?.affectedEntities).toEqual(["trades", "counterparties"]);
    expect(rows[0]?.severity).toBe("CRITICAL");
  });
});
