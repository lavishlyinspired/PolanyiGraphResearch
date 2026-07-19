import { z } from "zod";

// Mirrors packages/common/models.py (SessionSummary/AgentStep/AskResult).
export const sessionSummarySchema = z.object({
  session_id: z.string(),
  turn_count: z.number(),
  last_message: z.string().default(""),
  updated_at: z.string().default(""),
});

export const sessionMessageSchema = z.object({
  role: z.enum(["human", "ai"]),
  content: z.string(),
});

export const agentStepSchema = z.object({
  kind: z.enum(["tool_call", "tool_result", "validation", "answer"]),
  name: z.string().default(""),
  detail: z.string().default(""),
});

export const askResultSchema = z.object({
  question: z.string(),
  answer: z.string(),
  steps: z.array(agentStepSchema).default([]),
});

export type SessionSummary = z.infer<typeof sessionSummarySchema>;
export type SessionMessage = z.infer<typeof sessionMessageSchema>;
export type AgentStep = z.infer<typeof agentStepSchema>;
export type AskResult = z.infer<typeof askResultSchema>;

/** POST /api/ask returns 503 when no LLM provider is configured — the
 *  deterministic-mode signal, distinguished so the page can say so plainly
 *  instead of showing a generic failure. */
export class AgentUnavailableError extends Error {}

export async function fetchSessions(): Promise<SessionSummary[]> {
  const response = await fetch("/api/sessions");
  if (!response.ok) {
    throw new Error(`Sessions request failed with status ${response.status}`);
  }
  return z.array(sessionSummarySchema).parse(await response.json());
}

export async function fetchSessionMessages(sessionId: string): Promise<SessionMessage[]> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/messages`);
  if (!response.ok) {
    throw new Error(`Session messages request failed with status ${response.status}`);
  }
  return z.array(sessionMessageSchema).parse(await response.json());
}

export async function ask(question: string, sessionId: string): Promise<AskResult> {
  const response = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, session_id: sessionId }),
  });
  if (response.status === 503) {
    const body: unknown = await response.json();
    const detail =
      typeof body === "object" && body !== null && "detail" in body && typeof body.detail === "string"
        ? body.detail
        : "No LLM configured";
    throw new AgentUnavailableError(detail);
  }
  if (!response.ok) {
    throw new Error(`Ask request failed with status ${response.status}`);
  }
  return askResultSchema.parse(await response.json());
}
