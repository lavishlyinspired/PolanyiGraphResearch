import { render } from "vitest-browser-react";
import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { worker } from "../vitest.browser.setup";
import { AppShell } from "./AppShell";

test("defaults to the Validator page", async () => {
  const screen = await render(<AppShell />);
  await expect.element(screen.getByRole("heading", { name: "Validator" })).toBeVisible();
});

test("navigates to Query Console and back to Validator", async () => {
  const screen = await render(<AppShell />);

  await screen.getByRole("link", { name: /query console/i }).click();
  await expect.element(screen.getByRole("heading", { name: "Query Console" })).toBeVisible();

  await screen.getByRole("link", { name: /^validator/i }).click();
  await expect.element(screen.getByRole("heading", { name: "Validator" })).toBeVisible();
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
  await screen.getByRole("link", { name: /semantic model/i }).click();
  await expect.element(screen.getByRole("heading", { name: "Semantic Model" })).toBeVisible();
});

test("navigates to the Business Rules page", async () => {
  worker.use(http.get("/api/rules", () => HttpResponse.json([])));

  const screen = await render(<AppShell />);
  await screen.getByRole("link", { name: /business rules/i }).click();
  await expect.element(screen.getByRole("heading", { name: "Business Rules" })).toBeVisible();
});

test("navigates to the Data Sources page", async () => {
  worker.use(
    http.get("/api/sources", () => HttpResponse.json([])),
    http.get("/api/schema", () => HttpResponse.json({ dialect: "sqlite", tables: [] })),
  );

  const screen = await render(<AppShell />);
  await screen.getByRole("link", { name: /data sources/i }).click();
  await expect.element(screen.getByRole("heading", { name: "Data Sources" })).toBeVisible();
});
