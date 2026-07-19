import { render } from "vitest-browser-react";
import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { worker } from "../../../vitest.browser.setup";
import { LineagePerspective } from "./LineagePerspective";

function mockLineage(overrides?: { agentEvents?: unknown[] }) {
  worker.use(
    http.get("/api/schema", () =>
      HttpResponse.json({
        dialect: "sqlite",
        tables: [{ name: "trades", columns: [], foreign_keys: [{ column: "counterparty_id", references_table: "counterparties", references_column: "id" }] }],
      }),
    ),
    http.get("/api/context", () =>
      HttpResponse.json({
        domain: "Financial Services",
        glossary: [
          { term: "Counterparty", definition: "d", formula: null, source_tables: ["counterparties"], source_columns: [], unit: null, synonyms: [], ontology_class: null, ontology_uri: "x" },
        ],
        relationships: [],
        business_rules: [],
        key_entities: ["trades", "counterparties"],
        generated_by: "deterministic",
      }),
    ),
    http.get("/api/context/align/queue", () =>
      HttpResponse.json({
        items: [{ term: "Counterparty", band: "auto", candidate_label: "fibo:Counterparty", candidate_uri: "x", score: 0.95, candidates: [] }],
      }),
    ),
    http.get("/api/rules", () =>
      HttpResponse.json([{ rule_id: "BR-001", name: "Sanctioned Check", description: "d", severity: "CRITICAL", sql_hints: [], affected_entities: ["counterparties"] }]),
    ),
    http.get("/api/sessions", () => HttpResponse.json([{ session_id: "s1", turn_count: 2, last_message: "hi", updated_at: "t" }])),
    http.get("/api/compliance/events", () =>
      HttpResponse.json(
        overrides?.agentEvents ?? [
          { rule_id: "BR-001", verdict: "passed", sql: "SELECT * FROM counterparties", timestamp: "2026-07-19T12:00:00", source: "agent" },
        ],
      ),
    ),
  );
}

test("shows real pipeline stage counts", async () => {
  mockLineage();
  const screen = await render(<LineagePerspective />);
  const pipeline = screen.getByRole("region", { name: /knowledge lineage pipeline/i });
  await expect.element(pipeline.getByText("1 tables")).toBeVisible();
  await expect.element(pipeline.getByText("2 entities")).toBeVisible();
  await expect.element(pipeline.getByText("1 terms")).toBeVisible();
  await expect.element(pipeline.getByText("1 aligned")).toBeVisible();
  await expect.element(pipeline.getByText("1 rules")).toBeVisible();
  await expect.element(pipeline.getByText("1 sessions")).toBeVisible();
});

test("shows an honest descope note for lineage checkpoints rather than fabricating a version history", async () => {
  mockLineage();
  const screen = await render(<LineagePerspective />);
  const checkpoints = screen.getByRole("region", { name: /lineage checkpoints/i });
  await expect.element(checkpoints.getByText(/not available yet/i)).toBeVisible();
});

test("shows an honest empty state before the agent has run any query", async () => {
  mockLineage({ agentEvents: [] });
  const screen = await render(<LineagePerspective />);
  const trace = screen.getByRole("region", { name: /trace a fact's lineage/i });
  await expect.element(trace.getByText(/ask the agent a question/i)).toBeVisible();
});

test("tracing a real agent query shows its real tables, terms, and related rules", async () => {
  mockLineage();
  const screen = await render(<LineagePerspective />);
  const trace = screen.getByRole("region", { name: /trace a fact's lineage/i });
  await trace.getByLabelText(/real agent query/i).selectOptions("0");

  await expect.element(trace.getByText("Tables: counterparties")).toBeVisible();
  await expect.element(trace.getByText("Glossary terms: Counterparty")).toBeVisible();
  await expect.element(trace.getByText("Related rules: BR-001")).toBeVisible();
});

test("shows the 6-step guided walk", async () => {
  mockLineage();
  const screen = await render(<LineagePerspective />);
  const walk = screen.getByRole("region", { name: /how the graph was built/i });
  await expect.element(walk.getByText(/schema introspection/i)).toBeVisible();
  await expect.element(walk.getByText(/agent grounding/i)).toBeVisible();
});

test("degrades the FIBO stage honestly when GraphDB is unavailable, without failing the whole page", async () => {
  mockLineage();
  worker.use(http.get("/api/context/align/queue", () => HttpResponse.json({ detail: "not configured" }, { status: 503 })));
  const screen = await render(<LineagePerspective />);
  const pipeline = screen.getByRole("region", { name: /knowledge lineage pipeline/i });
  await expect.element(pipeline.getByText("unavailable")).toBeVisible();
});
