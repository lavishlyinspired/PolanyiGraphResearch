import { render } from "vitest-browser-react";
import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { worker } from "../../../vitest.browser.setup";
import { QueryConsolePage } from "./QueryConsolePage";

test("defaults to the SQL tab", async () => {
  const screen = await render(<QueryConsolePage />);
  await expect.element(screen.getByLabelText(/^sql$/i)).toBeVisible();
});

test("switches to the Cypher tab and its own input replaces the SQL one", async () => {
  const screen = await render(<QueryConsolePage />);
  await screen.getByRole("tab", { name: /cypher/i }).click();

  await expect.element(screen.getByLabelText(/cypher/i)).toBeVisible();
  await expect.element(screen.getByLabelText(/^sql$/i)).not.toBeVisible();
});

test("switches to the SPARQL tab and its own input replaces the others", async () => {
  const screen = await render(<QueryConsolePage />);
  await screen.getByRole("tab", { name: /sparql/i }).click();

  await expect.element(screen.getByLabelText(/sparql/i)).toBeVisible();
  await expect.element(screen.getByLabelText(/^sql$/i)).not.toBeVisible();
  await expect.element(screen.getByLabelText(/cypher/i)).not.toBeVisible();
});

test("each tab keeps its own state when you switch away and back", async () => {
  worker.use(
    http.post("/api/sql/execute", () =>
      HttpResponse.json({
        validation: { valid: true, violations: [], checked_rules: [] },
        columns: ["legal_name"],
        rows: [{ legal_name: "Acme Corp" }],
      }),
    ),
    http.get("/api/rules", () => HttpResponse.json([])),
  );

  const screen = await render(<QueryConsolePage />);
  await screen.getByLabelText(/^sql$/i).fill("SELECT legal_name FROM counterparties");
  await screen.getByRole("button", { name: /run/i }).click();
  await expect.element(screen.getByRole("cell", { name: "Acme Corp" })).toBeVisible();

  await screen.getByRole("tab", { name: /cypher/i }).click();
  await screen.getByRole("tab", { name: /^sql/i }).click();

  await expect.element(screen.getByLabelText(/sql/i)).toHaveValue(
    "SELECT legal_name FROM counterparties",
  );
  await expect.element(screen.getByRole("cell", { name: "Acme Corp" })).toBeVisible();
});
