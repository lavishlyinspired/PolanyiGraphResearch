import { z } from "zod";

// Mirrors packages/common/models.py (EnforcementEvent) — GET /api/compliance/events.
export const enforcementEventSchema = z.object({
  rule_id: z.string(),
  verdict: z.enum(["passed", "flagged", "blocked"]),
  sql: z.string(),
  timestamp: z.string(),
  source: z.enum(["validate", "execute", "agent"]),
});

export const ruleEnforcementSummarySchema = z.object({
  rule_id: z.string(),
  rule_name: z.string(),
  passed: z.number(),
  flagged: z.number(),
  blocked: z.number(),
});

// GET /api/compliance/summary.
export const complianceSummarySchema = z.object({
  window_days: z.number(),
  rules: z.array(ruleEnforcementSummarySchema).default([]),
  total_events: z.number(),
});

export type EnforcementEvent = z.infer<typeof enforcementEventSchema>;
export type RuleEnforcementSummary = z.infer<typeof ruleEnforcementSummarySchema>;
export type ComplianceSummary = z.infer<typeof complianceSummarySchema>;

export async function fetchComplianceSummary(): Promise<ComplianceSummary> {
  const response = await fetch("/api/compliance/summary");
  if (!response.ok) {
    throw new Error(`Compliance summary request failed with status ${response.status}`);
  }
  return complianceSummarySchema.parse(await response.json());
}

export async function fetchComplianceEvents(limit = 20): Promise<EnforcementEvent[]> {
  const response = await fetch(`/api/compliance/events?limit=${limit}`);
  if (!response.ok) {
    throw new Error(`Compliance events request failed with status ${response.status}`);
  }
  return z.array(enforcementEventSchema).parse(await response.json());
}
