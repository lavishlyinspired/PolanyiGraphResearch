import { render } from "vitest-browser-react";
import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { worker } from "../../../vitest.browser.setup";
import { DocumentsPerspective } from "./DocumentsPerspective";

function mockDocuments() {
  worker.use(
    http.get("/api/graph/explore", () =>
      HttpResponse.json({
        nodes: [
          { id: 1, label: "Document", name: "q1-memo", properties: { title: "q1-memo" } },
          { id: 2, label: "Mention", name: "q1-memo-0", properties: { text: "Acme Bank Corp" } },
          { id: 3, label: "Term", name: "Counterparty", properties: {} },
          { id: 4, label: "Entity", name: "counterparties", properties: {} },
        ],
        edges: [
          { source: 1, target: 2, type: "MENTIONS" },
          { source: 2, target: 3, type: "REFERS_TO" },
        ],
      }),
    ),
    http.get("/api/rules", () =>
      HttpResponse.json([
        { rule_id: "BR-001", name: "Sanctioned Check", description: "d", severity: "CRITICAL", sql_hints: [], affected_entities: ["counterparties"] },
      ]),
    ),
    http.get("/api/context", () =>
      HttpResponse.json({
        domain: "Financial Services",
        glossary: [
          { term: "Counterparty", definition: "d", formula: null, source_tables: ["counterparties"], source_columns: [], unit: null, synonyms: [], ontology_class: null, ontology_uri: null },
        ],
        relationships: [],
        business_rules: [],
        key_entities: [],
        generated_by: "deterministic",
      }),
    ),
  );
}

test("shows an honest 'requires Neo4j' state when unavailable", async () => {
  worker.use(http.get("/api/graph/explore", () => HttpResponse.json({ detail: "NEO4J_URI not configured" }, { status: 503 })));
  const screen = await render(<DocumentsPerspective />);
  await expect.element(screen.getByText(/requires neo4j/i)).toBeVisible();
});

test("shows an honest empty state before any document is materialized", async () => {
  worker.use(
    http.get("/api/graph/explore", () => HttpResponse.json({ nodes: [], edges: [] })),
    http.get("/api/rules", () => HttpResponse.json([])),
    http.get("/api/context", () =>
      HttpResponse.json({ domain: "d", glossary: [], relationships: [], business_rules: [], key_entities: [], generated_by: "deterministic" }),
    ),
  );
  const screen = await render(<DocumentsPerspective />);
  await expect.element(screen.getByText(/no documents materialized/i)).toBeVisible();
});

test("shows the real document mention summary", async () => {
  mockDocuments();
  const screen = await render(<DocumentsPerspective />);
  const summary = screen.getByRole("region", { name: /document mention summary/i });
  await expect.element(summary.getByText(/1 mentions · 1 resolved/)).toBeVisible();
});

test("shows the real mention chains table with derived related rules", async () => {
  mockDocuments();
  const screen = await render(<DocumentsPerspective />);
  const table = screen.getByRole("region", { name: /mention chains/i });
  await expect.element(table.getByText("Acme Bank Corp")).toBeVisible();
  await expect.element(table.getByText("Counterparty", { exact: true })).toBeVisible();
  await expect.element(table.getByText("BR-001", { exact: true })).toBeVisible();
});

test("clicking a node shows its real properties in the inspector", async () => {
  mockDocuments();
  const screen = await render(<DocumentsPerspective />);
  const canvas = screen.getByRole("group", { name: /documents graph/i });
  await canvas.getByRole("button", { name: "q1-memo", exact: true }).click();

  const inspector = screen.getByRole("region", { name: /inspector/i });
  await expect.element(inspector.getByRole("heading", { name: "q1-memo" })).toBeVisible();
  await expect.element(inspector.getByText("Document", { exact: true })).toBeVisible();
});

test("excludes Entity nodes from the documents-only canvas", async () => {
  mockDocuments();
  const screen = await render(<DocumentsPerspective />);
  const canvas = screen.getByRole("group", { name: /documents graph/i });
  await expect.element(canvas.getByRole("button", { name: "counterparties" })).not.toBeInTheDocument();
});
