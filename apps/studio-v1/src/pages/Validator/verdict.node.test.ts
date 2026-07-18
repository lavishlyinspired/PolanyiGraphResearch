import { describe, expect, test } from "vitest";
import {
  makeRule,
  makeValidationResult,
  makeViolation,
} from "@/test-support/factories";
import { overallVerdict, ruleRows } from "./verdict";

describe("overallVerdict", () => {
  test("is blocked when the result is invalid", () => {
    const result = makeValidationResult({
      valid: false,
      violations: [makeViolation()],
      checked_rules: ["BR-001"],
    });
    expect(overallVerdict(result)).toBe("blocked");
  });

  test("is passed-with-warnings when valid but violations remain", () => {
    const result = makeValidationResult({
      valid: true,
      violations: [makeViolation({ severity: "WARNING" })],
      checked_rules: ["BR-001"],
    });
    expect(overallVerdict(result)).toBe("passed-with-warnings");
  });

  test("is passed when valid with no violations", () => {
    const result = makeValidationResult({
      valid: true,
      violations: [],
      checked_rules: ["BR-001", "BR-002"],
    });
    expect(overallVerdict(result)).toBe("passed");
  });
});

describe("ruleRows", () => {
  test("maps a CRITICAL violation to a blocked row carrying its message and resolved name", () => {
    const result = makeValidationResult({
      valid: false,
      violations: [
        makeViolation({ rule_id: "BR-001", severity: "CRITICAL", message: "fix me" }),
      ],
      checked_rules: ["BR-001"],
    });
    const rows = ruleRows(result, [makeRule({ rule_id: "BR-001", name: "Sanctioned Check" })]);
    expect(rows).toEqual([
      { ruleId: "BR-001", name: "Sanctioned Check", level: "blocked", message: "fix me" },
    ]);
  });

  test("maps a WARNING violation to a warning row", () => {
    const result = makeValidationResult({
      valid: true,
      violations: [makeViolation({ rule_id: "BR-003", severity: "WARNING", message: "flag it" })],
      checked_rules: ["BR-003"],
    });
    const rows = ruleRows(result, [makeRule({ rule_id: "BR-003", name: "Country Flag" })]);
    expect(rows[0]?.level).toBe("warning");
  });

  test("maps a non-critical, non-warning severity to an advisory row", () => {
    const result = makeValidationResult({
      valid: true,
      violations: [makeViolation({ rule_id: "BR-004", severity: "ADVISORY", message: "convert" })],
      checked_rules: ["BR-004"],
    });
    const rows = ruleRows(result, [makeRule({ rule_id: "BR-004", name: "USD Norm" })]);
    expect(rows[0]?.level).toBe("advisory");
  });

  test("treats severity case-insensitively", () => {
    const result = makeValidationResult({
      valid: false,
      violations: [makeViolation({ rule_id: "BR-001", severity: "critical" })],
      checked_rules: ["BR-001"],
    });
    const rows = ruleRows(result, [makeRule({ rule_id: "BR-001" })]);
    expect(rows[0]?.level).toBe("blocked");
  });

  test("emits a pass row (no message) for a checked rule with no violation", () => {
    const result = makeValidationResult({
      valid: true,
      violations: [],
      checked_rules: ["BR-002"],
    });
    const rows = ruleRows(result, [makeRule({ rule_id: "BR-002", name: "Revenue" })]);
    expect(rows).toEqual([
      { ruleId: "BR-002", name: "Revenue", level: "pass", message: null },
    ]);
  });

  test("includes a violation whose rule is not in checked_rules (e.g. the DML guard)", () => {
    const result = makeValidationResult({
      valid: false,
      violations: [
        makeViolation({ rule_id: "GUARD-DML", severity: "CRITICAL", message: "read-only only" }),
      ],
      checked_rules: [],
    });
    const rows = ruleRows(result, []);
    expect(rows).toEqual([
      { ruleId: "GUARD-DML", name: "GUARD-DML", level: "blocked", message: "read-only only" },
    ]);
  });

  test("resolves each rule's name by id, not by list position", () => {
    const result = makeValidationResult({
      valid: false,
      violations: [makeViolation({ rule_id: "BR-002", severity: "CRITICAL" })],
      checked_rules: ["BR-002"],
    });
    const rows = ruleRows(result, [
      makeRule({ rule_id: "BR-001", name: "First Rule" }),
      makeRule({ rule_id: "BR-002", name: "Second Rule" }),
    ]);
    expect(rows[0]?.name).toBe("Second Rule");
  });

  test("orders violation rows before pass rows", () => {
    const result = makeValidationResult({
      valid: false,
      violations: [makeViolation({ rule_id: "BR-001", severity: "CRITICAL" })],
      checked_rules: ["BR-001", "BR-002"],
    });
    const rows = ruleRows(result, [
      makeRule({ rule_id: "BR-001" }),
      makeRule({ rule_id: "BR-002", name: "Revenue" }),
    ]);
    expect(rows.map((row) => row.level)).toEqual(["blocked", "pass"]);
  });
});
