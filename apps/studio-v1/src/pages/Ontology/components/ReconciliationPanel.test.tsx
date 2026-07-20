import { render } from "vitest-browser-react";
import { http, HttpResponse, type JsonBodyType } from "msw";
import { expect, test } from "vitest";
import { worker } from "../../../../vitest.browser.setup";
import { ReconciliationPanel } from "./ReconciliationPanel";
import type { Source } from "@/api/schema";
import type { ReconciliationResult } from "@/api/reconcile";

function mockSources(sources: Source[]) {
  worker.use(http.get("/api/sources", () => HttpResponse.json(sources)));
}

function primarySource(): Source {
  return {
    name: "financial_demo.db",
    dialect: "sqlite",
    kind: "SQLite",
    uri: "sqlite:///financial_demo.db",
    table_count: 7,
    status: "connected",
    last_introspected: "just now",
    objects_label: "7 tables",
    is_primary: true,
    removable: false,
    catalog: null,
    schema_name: null,
  };
}

function extraSource(overrides?: Partial<Source>): Source {
  return {
    ...primarySource(),
    name: "kyc_portfolio_demo",
    uri: "sqlite:///kyc_portfolio_demo.db",
    is_primary: false,
    removable: true,
    ...overrides,
  };
}

function getMockSources(overrides?: Source[]): Source[] {
  return overrides ?? [primarySource(), extraSource()];
}

function mockReconciliation(source: string, body: JsonBodyType) {
  worker.use(
    http.get("/api/context/reconcile", ({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get("source")).toBe(source);
      return HttpResponse.json(body);
    }),
  );
}

function getMockResult(overrides?: Partial<ReconciliationResult>): ReconciliationResult {
  return {
    source: "kyc_portfolio_demo",
    matches: [
      { source: "Legal Name", target: "Legal Name", confidence: 1.0, band: "auto" },
      { source: "Base Currency", target: "Currency", confidence: 0.5, band: "review" },
      { source: "Issuer", target: "High Yield Max Single Issuer", confidence: 0.5, band: "rejected" },
    ],
    ...overrides,
  };
}

test("excludes Databricks connections from the source picker (reconciliation only supports extra_sources)", async () => {
  mockSources([primarySource(), extraSource({ name: "dbc-a541b96d-b43f", dialect: "databricks" })]);
  const screen = await render(<ReconciliationPanel />);

  await expect
    .element(screen.getByText(/connect a second source/i))
    .toBeVisible();
});

test("shows an honest error state when the reconciliation request fails", async () => {
  mockSources(getMockSources());
  worker.use(
    http.get("/api/context/reconcile", () =>
      HttpResponse.json({ detail: "No connected source named 'kyc_portfolio_demo'" }, { status: 404 }),
    ),
  );

  const screen = await render(<ReconciliationPanel />);
  const panel = screen.getByRole("region", { name: /cross-source reconciliation/i });
  await expect.element(panel.getByText(/couldn.t load/i)).toBeVisible();
});

test("shows an honest empty state when no second source is connected", async () => {
  mockSources(getMockSources([primarySource()]));
  const screen = await render(<ReconciliationPanel />);

  await expect
    .element(screen.getByText(/connect a second source/i))
    .toBeVisible();
});

test("lists real cross-source matches for the selected source, bucketed by band", async () => {
  mockSources(getMockSources());
  mockReconciliation("kyc_portfolio_demo", getMockResult());
  const screen = await render(<ReconciliationPanel />);

  const panel = screen.getByRole("region", { name: /cross-source reconciliation/i });
  await expect.element(panel.getByRole("listitem", { name: /^legal name/i })).toBeVisible();
  await expect.element(panel.getByRole("listitem", { name: /^base currency/i })).toBeVisible();
  await expect.element(panel.getByText(/^auto$/i)).toBeVisible();
  await expect.element(panel.getByText(/^review$/i)).toBeVisible();
  await expect.element(panel.getByText(/^rejected$/i)).toBeVisible();
});

test("accepting a review match promotes it to auto in the list", async () => {
  mockSources(getMockSources());
  mockReconciliation("kyc_portfolio_demo", getMockResult());
  worker.use(
    http.post("/api/context/reconcile/kyc_portfolio_demo/Base%20Currency/accept", () =>
      HttpResponse.json(
        getMockResult({
          matches: [
            ...getMockResult().matches.filter((m) => m.source !== "Base Currency"),
            { source: "Base Currency", target: "Currency", confidence: 0.5, band: "auto" },
          ],
        }),
      ),
    ),
  );

  const screen = await render(<ReconciliationPanel />);
  const panel = screen.getByRole("region", { name: /cross-source reconciliation/i });
  const row = panel.getByRole("listitem", { name: /base currency/i });
  await row.getByRole("button", { name: /^accept$/i }).click();

  await expect.element(row.getByText(/^auto$/i)).toBeVisible();
});

test("rejecting a match moves it to the rejected band", async () => {
  mockSources(getMockSources());
  mockReconciliation("kyc_portfolio_demo", getMockResult());
  worker.use(
    http.post("/api/context/reconcile/kyc_portfolio_demo/Base%20Currency/reject", () =>
      HttpResponse.json(
        getMockResult({
          matches: [
            ...getMockResult().matches.filter((m) => m.source !== "Base Currency"),
            { source: "Base Currency", target: "Currency", confidence: 0.5, band: "rejected" },
          ],
        }),
      ),
    ),
  );

  const screen = await render(<ReconciliationPanel />);
  const panel = screen.getByRole("region", { name: /cross-source reconciliation/i });
  const row = panel.getByRole("listitem", { name: /base currency/i });
  await row.getByRole("button", { name: /^reject$/i }).click();

  await expect.element(row.getByText(/^rejected$/i)).toBeVisible();
});

test("accept/reject actions are not shown for already-decided matches", async () => {
  mockSources(getMockSources());
  mockReconciliation("kyc_portfolio_demo", getMockResult());
  const screen = await render(<ReconciliationPanel />);

  const panel = screen.getByRole("region", { name: /cross-source reconciliation/i });
  const autoRow = panel.getByRole("listitem", { name: /^legal name/i });
  await expect.element(autoRow.getByRole("button", { name: /^accept$/i })).not.toBeInTheDocument();
  await expect.element(autoRow.getByRole("button", { name: /^reject$/i })).not.toBeInTheDocument();
});

test("publishing reports the real number of triples written", async () => {
  mockSources(getMockSources());
  mockReconciliation("kyc_portfolio_demo", getMockResult());
  worker.use(
    http.post("/api/context/reconcile/kyc_portfolio_demo/publish", () =>
      HttpResponse.json({
        named_graph: "urn:polanyi:taxonomy:financial_demo.db:kyc_portfolio_demo",
        triples: 1,
        published_matches: 1,
      }),
    ),
  );

  const screen = await render(<ReconciliationPanel />);
  const panel = screen.getByRole("region", { name: /cross-source reconciliation/i });
  await panel.getByRole("button", { name: /publish/i }).click();

  await expect.element(panel.getByText(/1 triple/i)).toBeVisible();
});

test("publishing shows an honest 'requires GraphDB' message when unavailable", async () => {
  mockSources(getMockSources());
  mockReconciliation("kyc_portfolio_demo", getMockResult());
  worker.use(
    http.post("/api/context/reconcile/kyc_portfolio_demo/publish", () =>
      HttpResponse.json({ detail: "GRAPHDB_ENDPOINT not configured" }, { status: 503 }),
    ),
  );

  const screen = await render(<ReconciliationPanel />);
  const panel = screen.getByRole("region", { name: /cross-source reconciliation/i });
  await panel.getByRole("button", { name: /publish/i }).click();

  await expect.element(panel.getByText(/requires graphdb/i)).toBeVisible();
});

test("switching the source selector loads that source's own matches", async () => {
  mockSources(getMockSources([primarySource(), extraSource(), extraSource({ name: "other_source" })]));
  worker.use(
    http.get("/api/context/reconcile", ({ request }) => {
      const url = new URL(request.url);
      const source = url.searchParams.get("source");
      if (source === "other_source") {
        return HttpResponse.json({
          source: "other_source",
          matches: [{ source: "Unique Term", target: "Other Term", confidence: 1.0, band: "auto" }],
        });
      }
      return HttpResponse.json(getMockResult());
    }),
  );

  const screen = await render(<ReconciliationPanel />);
  const panel = screen.getByRole("region", { name: /cross-source reconciliation/i });
  await expect.element(panel.getByRole("listitem", { name: /^legal name/i })).toBeVisible();

  await screen.getByRole("button", { name: /other_source/i }).click();
  await expect.element(panel.getByText("Unique Term")).toBeVisible();
});
