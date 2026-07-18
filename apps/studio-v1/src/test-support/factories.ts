import {
  ruleSchema,
  validationResultSchema,
  violationSchema,
  type Rule,
  type ValidationResult,
  type Violation,
} from "@/api/validation";

export function makeViolation(overrides: Partial<Violation> = {}): Violation {
  return violationSchema.parse({
    rule_id: "BR-001",
    severity: "CRITICAL",
    message:
      "Sanctioned Counterparty Check: query touches trades, counterparties but does not handle is_sanctioned.",
    ...overrides,
  });
}

export function makeValidationResult(
  overrides: Partial<ValidationResult> = {},
): ValidationResult {
  return validationResultSchema.parse({
    valid: true,
    violations: [],
    checked_rules: [],
    ...overrides,
  });
}

export function makeRule(overrides: Partial<Rule> = {}): Rule {
  return ruleSchema.parse({
    rule_id: "BR-001",
    name: "Sanctioned Counterparty Check",
    description: "Exclude sanctioned counterparties.",
    severity: "CRITICAL",
    ...overrides,
  });
}
