import { render } from "vitest-browser-react";
import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { worker } from "../../../vitest.browser.setup";
import { AgentPage } from "./AgentPage";

function mockSessions() {
  worker.use(
    http.get("/api/sessions", () =>
      HttpResponse.json([
        { session_id: "sess-old", turn_count: 2, last_message: "And counterparties?", updated_at: "t" },
      ]),
    ),
  );
}

test("shows the real sessions list on load", async () => {
  mockSessions();
  const screen = await render(<AgentPage />);

  const rail = screen.getByRole("list", { name: /sessions/i });
  await expect.element(rail.getByText(/and counterparties/i)).toBeVisible();
  await expect.element(rail.getByText(/2 turns/i)).toBeVisible();
});

test("asking a question shows the real answer and reasoning trace", async () => {
  mockSessions();
  worker.use(
    http.post("/api/ask", () =>
      HttpResponse.json({
        question: "How many trades?",
        answer: "There are 6 trades.",
        steps: [
          { kind: "tool_call", name: "sql_db_query", detail: "SELECT COUNT(*) FROM trades" },
          { kind: "validation", name: "passed", detail: "SELECT COUNT(*) FROM trades" },
          { kind: "tool_result", name: "sql_db_query", detail: "[(6,)]" },
          { kind: "answer", name: "final", detail: "There are 6 trades." },
        ],
      }),
    ),
  );

  const screen = await render(<AgentPage />);
  await screen.getByLabelText(/ask a question/i).fill("How many trades?");
  await screen.getByRole("button", { name: /^ask$/i }).click();

  await expect.element(screen.getByText("There are 6 trades.").first()).toBeVisible();
  const trace = screen.getByRole("list", { name: /reasoning trace/i });
  await expect.element(trace.getByText(/sql_db_query/i).first()).toBeVisible();
  await expect.element(trace.getByText(/passed/i)).toBeVisible();
});

test("shows a blocked-then-passed validation step distinctly", async () => {
  mockSessions();
  worker.use(
    http.post("/api/ask", () =>
      HttpResponse.json({
        question: "Delete all trades",
        answer: "I can't run that — it violates a business rule.",
        steps: [
          { kind: "validation", name: "blocked", detail: "DELETE FROM trades — DML is not allowed" },
          { kind: "answer", name: "final", detail: "I can't run that — it violates a business rule." },
        ],
      }),
    ),
  );

  const screen = await render(<AgentPage />);
  await screen.getByLabelText(/ask a question/i).fill("Delete all trades");
  await screen.getByRole("button", { name: /^ask$/i }).click();

  const trace = screen.getByRole("list", { name: /reasoning trace/i });
  const blockedItem = trace.getByText(/blocked/i);
  await expect.element(blockedItem).toBeVisible();
  await expect.element(blockedItem).toHaveAttribute("data-step-status", "blocked");
});

test("resuming a session loads its real transcript before any new question", async () => {
  mockSessions();
  worker.use(
    http.get("/api/sessions/sess-old/messages", () =>
      HttpResponse.json([
        { role: "human", content: "How many trades?" },
        { role: "ai", content: "6." },
      ]),
    ),
  );

  const screen = await render(<AgentPage />);
  await screen.getByRole("list", { name: /sessions/i }).getByText(/and counterparties/i).click();

  await expect.element(screen.getByText("How many trades?")).toBeVisible();
  await expect.element(screen.getByText("6.")).toBeVisible();
});

test("starting a new session clears the transcript", async () => {
  mockSessions();
  worker.use(
    http.get("/api/sessions/sess-old/messages", () =>
      HttpResponse.json([{ role: "human", content: "How many trades?" }, { role: "ai", content: "6." }]),
    ),
  );

  const screen = await render(<AgentPage />);
  await screen.getByRole("list", { name: /sessions/i }).getByText(/and counterparties/i).click();
  await expect.element(screen.getByText("How many trades?")).toBeVisible();

  await screen.getByRole("button", { name: /new session/i }).click();
  await expect.element(screen.getByText("How many trades?")).not.toBeInTheDocument();
});

test("shows an honest message when no LLM is configured", async () => {
  mockSessions();
  worker.use(
    http.post("/api/ask", () =>
      HttpResponse.json({ detail: "No LLM configured. Set OPENAI_API_KEY." }, { status: 503 }),
    ),
  );

  const screen = await render(<AgentPage />);
  await screen.getByLabelText(/ask a question/i).fill("How many trades?");
  await screen.getByRole("button", { name: /^ask$/i }).click();

  await expect.element(screen.getByText(/no llm configured/i)).toBeVisible();
});
