import type { Rule } from "@/api/validation";
import type { RuleEnforcementSummary } from "@/api/compliance";
import type { GraphEdge, GraphNode } from "@/api/graph";

export function buildRulesGraph(rules: Rule[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const entityIdByName = new Map<string, number>();
  let nextId = 1;

  for (const rule of rules) {
    const ruleId = nextId++;
    nodes.push({
      id: ruleId,
      label: "Rule",
      name: rule.rule_id,
      properties: { name: rule.name, severity: rule.severity },
    });

    for (const entity of rule.affected_entities) {
      let entityId = entityIdByName.get(entity);
      if (entityId === undefined) {
        entityId = nextId++;
        entityIdByName.set(entity, entityId);
        nodes.push({ id: entityId, label: "Entity", name: entity, properties: {} });
      }
      edges.push({ source: ruleId, target: entityId, type: "APPLIES_TO" });
    }
  }

  return { nodes, edges };
}

export type RuleComplianceRow = {
  ruleId: string;
  ruleName: string;
  severity: string;
  affectedEntities: string[];
  passed: number;
  flagged: number;
  blocked: number;
};

export function buildComplianceRows(rules: Rule[], summary: RuleEnforcementSummary[]): RuleComplianceRow[] {
  const summaryByRule = new Map(summary.map((s) => [s.rule_id, s]));
  return rules.map((rule) => {
    const matched = summaryByRule.get(rule.rule_id);
    return {
      ruleId: rule.rule_id,
      ruleName: rule.name,
      severity: rule.severity,
      affectedEntities: rule.affected_entities,
      passed: matched?.passed ?? 0,
      flagged: matched?.flagged ?? 0,
      blocked: matched?.blocked ?? 0,
    };
  });
}
