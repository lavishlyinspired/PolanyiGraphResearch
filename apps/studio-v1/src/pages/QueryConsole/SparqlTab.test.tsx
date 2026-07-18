import { render } from "vitest-browser-react";
import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { worker } from "../../../vitest.browser.setup";
import { SparqlTab } from "./SparqlTab";

test("shows results and names GraphDB as the engine when it answered", async () => {
  worker.use(
    http.post("/api/sparql", () =>
      HttpResponse.json({ engine: "graphdb", rows: [{ term: "Counterparty" }] }),
    ),
  );

  const screen = await render(<SparqlTab />);
  await screen.getByLabelText(/sparql/i).fill("SELECT ?term WHERE { ?t skos:prefLabel ?term }");
  await screen.getByRole("button", { name: /run/i }).click();

  await expect.element(screen.getByText(/engine: graphdb/i)).toBeVisible();
  await expect.element(screen.getByText(/term: counterparty/i)).toBeVisible();
});

test("honestly shows the local pyoxigraph fallback when GraphDB isn't available", async () => {
  worker.use(
    http.post("/api/sparql", () =>
      HttpResponse.json({ engine: "local", rows: [{ term: "Trade" }] }),
    ),
  );

  const screen = await render(<SparqlTab />);
  await screen.getByLabelText(/sparql/i).fill("SELECT ?term WHERE { ?t skos:prefLabel ?term }");
  await screen.getByRole("button", { name: /run/i }).click();

  await expect.element(screen.getByText(/engine: local \(pyoxigraph\)/i)).toBeVisible();
});
