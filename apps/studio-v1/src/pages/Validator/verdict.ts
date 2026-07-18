import type { Rule, ValidationResult } from "@/api/validation";

export type RuleLevel = "blocked" | "warning" | "advisory" | "pass";
export type OverallVerdict = "blocked" | "passed-with-warnings" | "passed";

export interface RuleRow {
  ruleId: string;
  name: string;
  level: RuleLevel;
  message: string | null;
}

export function overallVerdict(result: ValidationResult): OverallVerdict {
  if (!result.valid) {
    return "blocked";
  }
  if (result.violations.length > 0) {
    return "passed-with-warnings";
  }
  return "passed";
}

function severityLevel(severity: string): Exclude<RuleLevel, "pass"> {
  const normalized = severity.toUpperCase();
  if (normalized === "CRITICAL") {
    return "blocked";
  }
  if (normalized === "WARNING") {
    return "warning";
  }
  return "advisory";
}

function ruleName(ruleId: string, rules: readonly Rule[]): string {
  return rules.find((rule) => rule.rule_id === ruleId)?.name ?? ruleId;
}

export function ruleRows(
  result: ValidationResult,
  rules: readonly Rule[],
): RuleRow[] {
  const violatedIds = new Set(result.violations.map((violation) => violation.rule_id));
  const violationRows: RuleRow[] = result.violations.map((violation) => ({
    ruleId: violation.rule_id,
    name: ruleName(violation.rule_id, rules),
    level: severityLevel(violation.severity),
    message: violation.message,
  }));
  const passRows: RuleRow[] = result.checked_rules
    .filter((ruleId) => !violatedIds.has(ruleId))
    .map((ruleId) => ({
      ruleId,
      name: ruleName(ruleId, rules),
      level: "pass" as const,
      message: null,
    }));
  return [...violationRows, ...passRows];
}
