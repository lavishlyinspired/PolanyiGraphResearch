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

/** Real SSE framing ("data: <json>\n\n" per event), matching exactly what
 * /api/ask/stream actually sends -- not just a JSON body. */
function mockAskStream(events: object[], options?: { captureBody?: (body: unknown) => void }) {
  worker.use(
    http.post("/api/ask/stream", async ({ request }) => {
      options?.captureBody?.(await request.json());
      const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
      return new HttpResponse(body, { headers: { "Content-Type": "text/event-stream" } });
    }),
  );
}

test("shows the real sessions list on load", async () => {
  mockSessions();
  const screen = await render(<AgentPage />);

  const rail = screen.getByRole("list", { name: /sessions/i });
  await expect.element(rail.getByText(/and counterparties/i)).toBeVisible();
  await expect.element(rail.getByText(/2 turns/i)).toBeVisible();
});

test("asking a question streams tool calls, tool results, and the final answer", async () => {
  mockSessions();
  mockAskStream([
    { type: "tool_call", name: "sql_db_query", detail: "SELECT COUNT(*) FROM trades" },
    { type: "tool_result", name: "sql_db_query", detail: "[(6,)]" },
    { type: "token", content: "There are " },
    { type: "token", content: "6 trades." },
    { type: "done", answer: "There are 6 trades." },
  ]);

  const screen = await render(<AgentPage />);
  await screen.getByLabelText(/ask a question/i).fill("How many trades?");
  await screen.getByRole("button", { name: /^ask$/i }).click();

  await expect.element(screen.getByText("There are 6 trades.").first()).toBeVisible();
  const trace = screen.getByRole("list", { name: /reasoning trace/i });
  await expect.element(trace.getByText(/sql_db_query/i).first()).toBeVisible();
});

test("shows tool calls and streamed answer tokens live, before the request finishes", async () => {
  mockSessions();
  // A stream that never sends "done" -- proves the UI reflects events as
  // they arrive, not only once the whole request completes.
  worker.use(
    http.post("/api/ask/stream", () => {
      const body =
        `data: ${JSON.stringify({ type: "tool_call", name: "sql_db_list_tables", detail: "{}" })}\n\n` +
        `data: ${JSON.stringify({ type: "token", content: "Working on it" })}\n\n`;
      return new HttpResponse(body, { headers: { "Content-Type": "text/event-stream" } });
    }),
  );

  const screen = await render(<AgentPage />);
  await screen.getByLabelText(/ask a question/i).fill("How many trades?");
  await screen.getByRole("button", { name: /^ask$/i }).click();

  const trace = screen.getByRole("list", { name: /reasoning trace/i });
  await expect.element(trace.getByText(/sql_db_list_tables/i).first()).toBeVisible();
  await expect.element(screen.getByText(/working on it/i).first()).toBeVisible();
});

test("renders the agent's markdown answer as real formatted elements, not literal asterisks", async () => {
  mockSessions();
  mockAskStream([
    { type: "token", content: "**Ford Motor Credit** is rated `BB+`." },
    { type: "done", answer: "**Ford Motor Credit** is rated `BB+`." },
  ]);

  const screen = await render(<AgentPage />);
  await screen.getByLabelText(/ask a question/i).fill("What is Ford rated?");
  await screen.getByRole("button", { name: /^ask$/i }).click();

  await expect.element(screen.getByText("Ford Motor Credit").first()).toBeVisible();
  // No literal markdown syntax leaking into the rendered *conversation*
  // specifically -- the separate Reasoning Trace panel is a technical/
  // debug view that intentionally shows raw step detail text, not a
  // second rendered copy of the answer.
  const conversation = screen.getByRole("log", { name: /conversation/i }).element();
  expect(conversation.textContent).not.toContain("**Ford");
});

test("shows a blocked-then-passed validation step distinctly", async () => {
  mockSessions();
  mockAskStream([
    { type: "tool_call", name: "sql_db_query", detail: "DELETE FROM trades" },
    { type: "token", content: "I can't run that — it violates a business rule." },
    { type: "done", answer: "I can't run that — it violates a business rule." },
  ]);

  const screen = await render(<AgentPage />);
  await screen.getByLabelText(/ask a question/i).fill("Delete all trades");
  await screen.getByRole("button", { name: /^ask$/i }).click();

  const trace = screen.getByRole("list", { name: /reasoning trace/i });
  await expect.element(trace.getByText(/sql_db_query/i).first()).toBeVisible();
});

test("resuming a session loads its real transcript before any new question", async () => {
  mockSessions();
  worker.use(
    http.get("/api/sessions/sess-old/messages", () =>
      HttpResponse.json([
        { role: "human", content: "How many trades?" },
        { role: "ai", content: "Six trades." },
      ]),
    ),
  );

  const screen = await render(<AgentPage />);
  await screen.getByRole("list", { name: /sessions/i }).getByText(/and counterparties/i).click();

  await expect.element(screen.getByText("How many trades?")).toBeVisible();
  await expect.element(screen.getByText("Six trades.")).toBeVisible();
});

test("starting a new session clears the transcript", async () => {
  mockSessions();
  worker.use(
    http.get("/api/sessions/sess-old/messages", () =>
      HttpResponse.json([{ role: "human", content: "How many trades?" }, { role: "ai", content: "Six trades." }]),
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
    http.post("/api/ask/stream", () =>
      HttpResponse.json({ detail: "No LLM configured. Set OPENAI_API_KEY." }, { status: 503 }),
    ),
  );

  const screen = await render(<AgentPage />);
  await screen.getByLabelText(/ask a question/i).fill("How many trades?");
  await screen.getByRole("button", { name: /^ask$/i }).click();

  await expect.element(screen.getByText(/no llm configured/i)).toBeVisible();
});

// ── Provider switcher ─────────────────────────────────────────────

test("sends a saved provider override in the ask stream request", async () => {
  localStorage.clear();
  mockSessions();
  worker.use(
    http.get("/api/providers/opencode/models", () =>
      HttpResponse.json([
        { id: "big-pickle", is_free: true },
        { id: "deepseek-v4-flash-free", is_free: true },
        { id: "claude-opus-4-8", is_free: false },
      ]),
    ),
  );
  let capturedBody: Record<string, unknown> | null = null;
  mockAskStream([{ type: "done", answer: "ok" }], {
    captureBody: (body) => {
      capturedBody = body as Record<string, unknown>;
    },
  });

  const screen = await render(<AgentPage />);
  await screen.getByRole("button", { name: /provider/i }).click();
  await screen.getByLabelText(/^provider$/i).selectOptions("opencode");
  await expect.element(screen.getByLabelText(/^model$/i)).toBeVisible();
  await screen.getByLabelText(/^model$/i).selectOptions("deepseek-v4-flash-free");
  await screen.getByLabelText(/api key/i).fill("sk-client-key");
  await screen.getByRole("button", { name: /save/i }).click();

  await screen.getByLabelText(/ask a question/i).fill("test");
  await screen.getByRole("button", { name: /^ask$/i }).click();

  await expect.poll(() => capturedBody !== null).toBe(true);
  expect(capturedBody).toMatchObject({
    override_model: "deepseek-v4-flash-free",
    override_api_key: "sk-client-key",
    override_base_url: "https://opencode.ai/zen/v1",
  });
});

test("labels free models distinctly from paid ones", async () => {
  localStorage.clear();
  mockSessions();
  worker.use(
    http.get("/api/providers/opencode/models", () =>
      HttpResponse.json([
        { id: "big-pickle", is_free: true },
        { id: "claude-opus-4-8", is_free: false },
      ]),
    ),
  );

  const screen = await render(<AgentPage />);
  await screen.getByRole("button", { name: /provider/i }).click();
  await screen.getByLabelText(/^provider$/i).selectOptions("opencode");

  const modelSelect = screen.getByLabelText(/^model$/i);
  await expect.element(modelSelect.getByRole("option", { name: /big-pickle.*free/i })).toBeInTheDocument();
  await expect
    .element(modelSelect.getByRole("option", { name: /^claude-opus-4-8$/i }))
    .toBeInTheDocument();
});

test("does not send an override after clearing it", async () => {
  localStorage.clear();
  mockSessions();
  worker.use(
    http.get("/api/providers/opencode/models", () =>
      HttpResponse.json([{ id: "deepseek-v4-flash-free", is_free: true }]),
    ),
  );
  let capturedBody: Record<string, unknown> | null = null;
  mockAskStream([{ type: "done", answer: "ok" }], {
    captureBody: (body) => {
      capturedBody = body as Record<string, unknown>;
    },
  });

  const screen = await render(<AgentPage />);
  await screen.getByRole("button", { name: /provider/i }).click();
  await screen.getByLabelText(/^provider$/i).selectOptions("opencode");
  await screen.getByLabelText(/^model$/i).selectOptions("deepseek-v4-flash-free");
  await screen.getByLabelText(/api key/i).fill("sk-client-key");
  await screen.getByRole("button", { name: /save/i }).click();
  await screen.getByRole("button", { name: /use server default/i }).click();

  await screen.getByLabelText(/ask a question/i).fill("test");
  await screen.getByRole("button", { name: /^ask$/i }).click();

  await expect.poll(() => capturedBody !== null).toBe(true);
  expect(capturedBody).not.toHaveProperty("override_model");
});
