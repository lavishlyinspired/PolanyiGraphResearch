import { render } from "vitest-browser-react";
import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { worker } from "../../../vitest.browser.setup";
import { GlossaryPerspective } from "./GlossaryPerspective";

function mockQueueAndContext() {
  worker.use(
    http.get("/api/context/align/queue", () =>
      HttpResponse.json({
        items: [
          {
            term: "Counterparty",
            band: "auto",
            candidate_label: "fibo:Counterparty",
            candidate_uri: "https://fibo/Counterparty",
            score: 0.97,
            candidates: [],
          },
          {
            term: "Settlement Venue",
            band: "unmapped",
            candidate_label: null,
            candidate_uri: null,
            score: 0,
            candidates: [],
          },
        ],
      }),
    ),
    http.get("/api/context", () =>
      HttpResponse.json({
        domain: "Financial Services",
        glossary: [
          {
            term: "Counterparty",
            definition: "The legal entity on the other side of a trade.",
            formula: null,
            source_tables: ["counterparties"],
            source_columns: [],
            unit: null,
            synonyms: [],
            ontology_class: null,
            ontology_uri: null,
          },
        ],
        relationships: [],
        business_rules: [],
        key_entities: [],
        generated_by: "deterministic",
      }),
    ),
  );
}

test("shows an honest 'requires GraphDB' state when the alignment queue is unavailable", async () => {
  worker.use(http.get("/api/context/align/queue", () => HttpResponse.json({ detail: "not configured" }, { status: 503 })));
  const screen = await render(<GlossaryPerspective />);
  await expect.element(screen.getByText(/requires graphdb/i)).toBeVisible();
});

test("shows real alignment status counts", async () => {
  mockQueueAndContext();
  const screen = await render(<GlossaryPerspective />);
  const stats = screen.getByRole("region", { name: /alignment status/i });
  await expect.element(stats.getByText("1 auto-aligned")).toBeVisible();
  await expect.element(stats.getByText("1 unmapped")).toBeVisible();
  await expect.element(stats.getByText("0 need review")).toBeVisible();
});

test("shows the terms & alignment table with real source tables joined from the context", async () => {
  mockQueueAndContext();
  const screen = await render(<GlossaryPerspective />);
  const table = screen.getByRole("region", { name: /terms and alignment/i });
  await expect.element(table.getByText("Counterparty", { exact: true })).toBeVisible();
  await expect.element(table.getByText("counterparties")).toBeVisible();
  await expect.element(table.getByText("fibo:Counterparty", { exact: true })).toBeVisible();
});

test("clicking a term node shows its real alignment details in the inspector", async () => {
  mockQueueAndContext();
  const screen = await render(<GlossaryPerspective />);
  const canvas = screen.getByRole("group", { name: /glossary alignment graph/i });
  await canvas.getByRole("button", { name: "Counterparty", exact: true }).click();

  const inspector = screen.getByRole("region", { name: /inspector/i });
  await expect.element(inspector.getByRole("heading", { name: "Counterparty" })).toBeVisible();
  await expect.element(inspector.getByText(/fibo:counterparty/i)).toBeVisible();
  await expect.element(inspector.getByText("0.97")).toBeVisible();
});

test("never fabricates a FIBO class for an unmapped term", async () => {
  mockQueueAndContext();
  const screen = await render(<GlossaryPerspective />);
  const table = screen.getByRole("region", { name: /terms and alignment/i });
  const row = table.getByRole("row", { name: /settlement venue/i });
  await expect.element(row.getByRole("cell", { name: "—", exact: true }).first()).toBeVisible();
});
