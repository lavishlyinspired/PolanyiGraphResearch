import { z } from "zod";

// Mirrors packages/common/models.py (Violation / ValidationResult) at the trust boundary.
export const violationSchema = z.object({
  rule_id: z.string(),
  severity: z.string(),
  message: z.string(),
});

export const validationResultSchema = z.object({
  valid: z.boolean(),
  violations: z.array(violationSchema).default([]),
  checked_rules: z.array(z.string()).default([]),
});

export type Violation = z.infer<typeof violationSchema>;
export type ValidationResult = z.infer<typeof validationResultSchema>;

export async function validateSql(sql: string): Promise<ValidationResult> {
  const response = await fetch("/api/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql }),
  });
  if (!response.ok) {
    throw new Error(`Validation request failed with status ${response.status}`);
  }
  return validationResultSchema.parse(await response.json());
}
