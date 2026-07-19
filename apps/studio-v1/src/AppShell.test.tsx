import { render } from "vitest-browser-react";
import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { worker } from "../vitest.browser.setup";
import { AppShell } from "./AppShell";

test("shows the wordmark and defaults to the Overview page", async () => {
  const screen = await render(<AppShell />);
  await expect.element(screen.getByText("Polanyi Works")).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Overview" })).toBeVisible();
});

test("shows the built-out nav groups in prototype order", async () => {
  const screen = await render(<AppShell />);
  await expect.element(screen.getByText("Ground")).toBeVisible();
  await expect.element(screen.getByText("Explore")).toBeVisible();
  await expect.element(screen.getByText("Govern")).toBeVisible();
});

test("navigates to Query Console and back to Overview, updating aria-current", async () => {
  const screen = await render(<AppShell />);

  const overviewNav = screen.getByRole("button", { name: /^overview$/i });
  const consoleNav = screen.getByRole("button", { name: /query console/i });

  await expect.element(overviewNav).toHaveAttribute("aria-current", "page");

  await consoleNav.click();
  await expect.element(screen.getByRole("heading", { name: "Query Console" })).toBeVisible();
  await expect.element(consoleNav).toHaveAttribute("aria-current", "page");
  await expect.element(overviewNav).not.toHaveAttribute("aria-current");

  await overviewNav.click();
  await expect.element(screen.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect.element(overviewNav).toHaveAttribute("aria-current", "page");
});

test("navigates to the Semantic Model page", async () => {
  worker.use(
    http.get("/api/context", () =>
      HttpResponse.json({
        domain: "Financial Services",
        glossary: [],
        business_rules: [],
        key_entities: [],
        generated_by: "deterministic",
      }),
    ),
  );

  const screen = await render(<AppShell />);
  await screen.getByRole("button", { name: /semantic model/i }).click();
  await expect.element(screen.getByRole("heading", { name: "Semantic Model" })).toBeVisible();
});

test("navigates to the Business Rules page", async () => {
  worker.use(http.get("/api/rules", () => HttpResponse.json([])));

  const screen = await render(<AppShell />);
  await screen.getByRole("button", { name: /business rules/i }).click();
  await expect.element(screen.getByRole("heading", { name: "Business Rules" })).toBeVisible();
});

test("navigates to the Ontology · FIBO page", async () => {
  worker.use(
    http.get("/api/context/align/queue", () => HttpResponse.json({ items: [] })),
  );

  const screen = await render(<AppShell />);
  await screen.getByRole("button", { name: /ontology/i }).click();
  await expect.element(screen.getByRole("heading", { name: /ontology · fibo/i })).toBeVisible();
});

test("navigates to the Data Sources page", async () => {
  worker.use(
    http.get("/api/sources", () => HttpResponse.json([])),
    http.get("/api/schema", () => HttpResponse.json({ dialect: "sqlite", tables: [] })),
  );

  const screen = await render(<AppShell />);
  await screen.getByRole("button", { name: /data sources/i }).click();
  await expect.element(screen.getByRole("heading", { name: "Data Sources" })).toBeVisible();
});

test("navigates to the Documents page", async () => {
  const screen = await render(<AppShell />);
  await screen.getByRole("button", { name: /^documents$/i }).click();
  await expect.element(screen.getByRole("heading", { name: "Documents" })).toBeVisible();
});
