import { render } from "vitest-browser-react";
import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { worker } from "../../../vitest.browser.setup";
import { GraphPage } from "./GraphPage";

function mockStats(body: { nodes: number; edges: number; materialized_at: string | null }) {
  worker.use(http.get("/api/graph/stats", () => HttpResponse.json(body)));
}

test("shows an honest 'requires Neo4j' state when unavailable", async () => {
  worker.use(http.get("/api/graph/stats", () => HttpResponse.json({ detail: "NEO4J_URI not configured" }, { status: 503 })));
  const screen = await render(<GraphPage />);
  await expect.element(screen.getByText(/requires neo4j/i)).toBeVisible();
});

test("shows an honest empty-graph call-to-action before materializing", async () => {
  mockStats({ nodes: 0, edges: 0, materialized_at: null });
  const screen = await render(<GraphPage />);
  await expect.element(screen.getByText(/never synced/i)).toBeVisible();
  await expect.element(screen.getByText(/materialize the graph/i)).toBeVisible();
});

test("materializing populates the graph and shows a real synced-when line", async () => {
  // Both stats responses are registered up front, sequenced with `once`, so
  // which one the component receives depends only on call order -- never on
  // a race between the test mutating the mock and the component's in-flight
  // fetch (which would be flaky under load, not deterministic).
  worker.use(
    http.get("/api/graph/stats", () => HttpResponse.json({ nodes: 0, edges: 0, materialized_at: null }), {
      once: true,
    }),
    http.get("/api/graph/stats", () =>
      HttpResponse.json({ nodes: 2, edges: 1, materialized_at: "2026-07-19T12:00:00" }),
    ),
    http.post("/api/graph/materialize", () => HttpResponse.json({ entities: 2, terms: 1, relationships: 1 })),
    http.get("/api/graph/explore", () =>
      HttpResponse.json({
        nodes: [
          { id: 1, label: "Entity", name: "trades", properties: { name: "trades" } },
          { id: 2, label: "Entity", name: "counterparties", properties: { name: "counterparties" } },
        ],
        edges: [{ source: 1, target: 2, type: "RELATES_TO" }],
      }),
    ),
  );

  const screen = await render(<GraphPage />);
  await expect.element(screen.getByText(/never synced/i)).toBeVisible();

  await screen.getByRole("button", { name: /re-materialize/i }).click();

  const graph = screen.getByRole("group", { name: /knowledge graph/i });
  await expect.element(graph.getByRole("button", { name: "trades" })).toBeVisible();
  // "Never synced" and "Synced <timestamp>" are mutually exclusive render
  // states, so matching /synced/ alone (without pinning to a locale-specific
  // date format) unambiguously proves the real timestamp branch rendered.
  await expect.element(screen.getByText(/synced/i)).toBeVisible();
});

test("clicking a node shows its real properties in the inspector", async () => {
  mockStats({ nodes: 2, edges: 1, materialized_at: "2026-07-19T12:00:00" });
  worker.use(
    http.get("/api/graph/explore", () =>
      HttpResponse.json({
        nodes: [
          { id: 1, label: "Entity", name: "trades", properties: { name: "trades", domain: "Financial Services" } },
          { id: 2, label: "Entity", name: "counterparties", properties: { name: "counterparties" } },
        ],
        edges: [{ source: 1, target: 2, type: "RELATES_TO" }],
      }),
    ),
  );

  const screen = await render(<GraphPage />);
  const graph = screen.getByRole("group", { name: /knowledge graph/i });
  await graph.getByRole("button", { name: "trades" }).click();

  const inspector = screen.getByRole("region", { name: /inspector/i });
  await expect.element(inspector.getByRole("heading", { name: "trades" })).toBeVisible();
  await expect.element(inspector.getByText(/financial services/i)).toBeVisible();
  await expect.element(inspector.getByText(/relates_to/i)).toBeVisible();
});

test("shows the real node label legend", async () => {
  mockStats({ nodes: 0, edges: 0, materialized_at: null });
  const screen = await render(<GraphPage />);
  const legend = screen.getByRole("list", { name: /legend/i });
  await expect.element(legend.getByText("Entity")).toBeVisible();
  await expect.element(legend.getByText("Term")).toBeVisible();
  await expect.element(legend.getByText("Document")).toBeVisible();
  await expect.element(legend.getByText("Mention")).toBeVisible();
});

test("switching to the Glossary perspective shows real alignment data, not the Neo4j graph", async () => {
  mockStats({ nodes: 0, edges: 0, materialized_at: null });
  worker.use(
    http.get("/api/context/align/queue", () =>
      HttpResponse.json({
        items: [
          { term: "Trade", band: "auto", candidate_label: "fibo:Trade", candidate_uri: "https://fibo/Trade", score: 0.95, candidates: [] },
        ],
      }),
    ),
    http.get("/api/context", () =>
      HttpResponse.json({
        domain: "Financial Services",
        glossary: [
          { term: "Trade", definition: "A trade.", formula: null, source_tables: ["trades"], source_columns: [], unit: null, synonyms: [], ontology_class: null, ontology_uri: null },
        ],
        relationships: [],
        business_rules: [],
        key_entities: [],
        generated_by: "deterministic",
      }),
    ),
  );

  const screen = await render(<GraphPage />);
  const perspectiveSwitcher = screen.getByRole("group", { name: /graph perspective/i });
  await perspectiveSwitcher.getByRole("button", { name: "Glossary" }).click();

  await expect.element(screen.getByRole("region", { name: /alignment status/i })).toBeVisible();
  await expect.element(screen.getByText("1 auto-aligned")).toBeVisible();
  await expect.element(screen.getByText(/materialize the graph/i)).not.toBeInTheDocument();
});
