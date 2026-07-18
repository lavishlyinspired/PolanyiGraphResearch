import { render } from "vitest-browser-react";
import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { worker } from "../../../vitest.browser.setup";
import { RulesPage } from "./RulesPage";

const rules = [
  {
    rule_id: "BR-001",
    name: "Sanctioned Counterparty Check",
    description: "Exclude sanctioned counterparties from exposure analytics.",
    severity: "CRITICAL",
    sql_hints: ["is_sanctioned"],
    affected_entities: ["trades", "counterparties"],
  },
  {
    rule_id: "BR-004",
    name: "USD Normalization",
    description: "Convert monetary amounts to USD.",
    severity: "ADVISORY",
    sql_hints: ["rate_to_usd"],
    affected_entities: ["trades", "fx_rates"],
  },
];

function mock() {
  worker.use(http.get("/api/rules", () => HttpResponse.json(rules)));
}

test("lists every declared rule with its severity", async () => {
  mock();
  const screen = await render(<RulesPage />);

  await expect
    .element(screen.getByRole("cell", { name: "Sanctioned Counterparty Check" }))
    .toBeVisible();
  await expect.element(screen.getByText("CRITICAL", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("ADVISORY", { exact: true })).toBeVisible();
});

test("opens a rule detail showing description and affected tables", async () => {
  mock();
  const screen = await render(<RulesPage />);

  await screen.getByRole("button", { name: /sanctioned counterparty check/i }).click();

  const detail = screen.getByLabelText("Rule detail");
  await expect
    .element(detail.getByText("Exclude sanctioned counterparties from exposure analytics."))
    .toBeVisible();
  await expect.element(detail.getByText("trades", { exact: true })).toBeVisible();
  await expect.element(detail.getByText("counterparties", { exact: true })).toBeVisible();
});

test("there is no way to create or edit a rule — read-only by design", async () => {
  mock();
  const screen = await render(<RulesPage />);

  await expect.element(screen.getByRole("textbox")).not.toBeInTheDocument();
  await expect.element(screen.getByRole("button", { name: /new rule/i })).not.toBeInTheDocument();
});
