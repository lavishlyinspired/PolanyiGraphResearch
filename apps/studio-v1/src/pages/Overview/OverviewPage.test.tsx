import { render } from "vitest-browser-react";
import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { worker } from "../../../vitest.browser.setup";
import { OverviewPage } from "./OverviewPage";

const sources = [
  {
    name: "demo.db",
    dialect: "sqlite",
    kind: "SQLite",
    uri: "sqlite:///demo.db",
    table_count: 7,
    status: "connected",
    last_introspected: "2 h ago",
    objects_label: "7 tables",
    is_primary: true,
    removable: false,
  },
  {
    name: "reporting-db",
    dialect: "sqlite",
    kind: "SQLite",
    uri: "sqlite:///reporting.db",
    table_count: 0,
    status: "configured",
    last_introspected: null,
    objects_label: "not introspected",
    is_primary: false,
    removable: true,
  },
];

const context = {
  domain: "Financial Services",
  glossary: [{ term: "Notional Amount", definition: "..." }],
  relationships: [
    {
      from_entity: "trades",
      to_entity: "counterparties",
      relationship_type: "many-to-one",
      foreign_key: "counterparty_id",
      description: "...",
    },
  ],
  business_rules: [
    { rule_id: "BR-001", name: "Sanctioned Counterparty Check", description: "...", severity: "CRITICAL", affected_entities: [] },
  ],
  key_entities: ["trades"],
  generated_by: "deterministic",
};

function mockDefaults() {
  worker.use(
    http.get("/api/sources", () => HttpResponse.json(sources)),
    http.get("/api/context", () => HttpResponse.json(context)),
    http.get("/api/context/align/queue", () => new HttpResponse(null, { status: 503 })),
    http.get("/api/graph/stats", () => new HttpResponse(null, { status: 503 })),
    http.get("/api/health", () =>
      HttpResponse.json({
        status: "ok",
        version: "0.1.0",
        llm_mode: "deterministic",
        db_uri: "sqlite:///demo.db",
        graphdb: { configured: false, available: false },
        neo4j: { configured: false, available: false },
      }),
    ),
  );
}

test("shows real source and semantic context counts in the pipeline", async () => {
  mockDefaults();
  const screen = await render(<OverviewPage />);

  await expect.element(screen.getByText(/1 connected · 7 tables introspected/i)).toBeVisible();
  await expect.element(screen.getByText(/1 terms · 1 relationships · 1 rules/i)).toBeVisible();
});

test("shows an honest 'not configured' state instead of fabricated ontology/graph stats", async () => {
  mockDefaults();
  const screen = await render(<OverviewPage />);

  await expect.element(screen.getByText(/graphdb not configured/i)).toBeVisible();
  await expect.element(screen.getByText(/neo4j not configured/i)).toBeVisible();
});

test("shows real ontology alignment counts when GraphDB is available", async () => {
  worker.use(
    http.get("/api/sources", () => HttpResponse.json(sources)),
    http.get("/api/context", () => HttpResponse.json(context)),
    http.get("/api/context/align/queue", () =>
      HttpResponse.json({
        items: [
          { term: "Notional Amount", band: "auto", candidate_label: "Notional Amount", candidate_uri: "urn:fibo:x", score: 0.95 },
          { term: "Status", band: "review", candidate_label: null, candidate_uri: null, score: 0.6 },
        ],
      }),
    ),
    http.get("/api/graph/stats", () => HttpResponse.json({ nodes: 148, edges: 212 })),
    http.get("/api/health", () =>
      HttpResponse.json({
        status: "ok",
        version: "0.1.0",
        llm_mode: "llm",
        db_uri: "sqlite:///demo.db",
        graphdb: { configured: true, available: true },
        neo4j: { configured: true, available: true },
      }),
    ),
  );
  const screen = await render(<OverviewPage />);

  await expect.element(screen.getByText(/1 \/ 2 aligned to fibo · 1 to review/i)).toBeVisible();
  await expect.element(screen.getByText(/148 nodes · 212 relationships/i)).toBeVisible();
});

test("shows real runtime health status for GraphDB, Neo4j, and LLM", async () => {
  worker.use(
    http.get("/api/sources", () => HttpResponse.json(sources)),
    http.get("/api/context", () => HttpResponse.json(context)),
    http.get("/api/context/align/queue", () => new HttpResponse(null, { status: 503 })),
    http.get("/api/graph/stats", () => new HttpResponse(null, { status: 503 })),
    http.get("/api/health", () =>
      HttpResponse.json({
        status: "ok",
        version: "0.1.0",
        llm_mode: "llm",
        db_uri: "sqlite:///demo.db",
        graphdb: { configured: true, available: false },
        neo4j: { configured: false, available: false },
      }),
    ),
  );
  const screen = await render(<OverviewPage />);

  await expect.element(screen.getByText("unreachable", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("key detected", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("not configured", { exact: true })).toBeVisible();
});
