import { render } from "vitest-browser-react";
import { http, HttpResponse, type JsonBodyType } from "msw";
import { expect, test } from "vitest";
import { worker } from "../../../vitest.browser.setup";
import { SqlTab } from "./SqlTab";

const rules = [
  {
    rule_id: "BR-001",
    name: "Sanctioned Counterparty Check",
    description: "Exclude sanctioned counterparties.",
    severity: "CRITICAL",
  },
];

function mock(executeBody: JsonBodyType) {
  worker.use(
    http.post("/api/sql/execute", () => HttpResponse.json(executeBody)),
    http.get("/api/rules", () => HttpResponse.json(rules)),
  );
}

test("shows a results table when the query passes", async () => {
  mock({
    validation: { valid: true, violations: [], checked_rules: [] },
    columns: ["legal_name"],
    rows: [{ legal_name: "Acme Corp" }, { legal_name: "Meridian Global" }],
  });

  const screen = await render(<SqlTab />);
  await screen.getByLabelText(/sql/i).fill("SELECT legal_name FROM counterparties");
  await screen.getByRole("button", { name: /run/i }).click();

  await expect.element(screen.getByRole("columnheader", { name: "legal_name" })).toBeVisible();
  await expect.element(screen.getByRole("cell", { name: "Acme Corp" })).toBeVisible();
  await expect.element(screen.getByRole("cell", { name: "Meridian Global" })).toBeVisible();
});

test("shows the blocked verdict ledger instead of a table when the gate blocks the query", async () => {
  mock({
    validation: {
      valid: false,
      violations: [
        {
          rule_id: "BR-001",
          severity: "CRITICAL",
          message: "Sanctioned Counterparty Check: does not handle is_sanctioned.",
        },
      ],
      checked_rules: ["BR-001"],
    },
    columns: [],
    rows: [],
  });

  const screen = await render(<SqlTab />);
  await screen.getByLabelText(/sql/i).fill(
    "SELECT * FROM trades t JOIN counterparties c ON t.counterparty_id = c.counterparty_id",
  );
  await screen.getByRole("button", { name: /run/i }).click();

  await expect.element(screen.getByRole("status")).toHaveTextContent(/blocked/i);
  await expect
    .element(screen.getByText("Sanctioned Counterparty Check", { exact: true }))
    .toBeVisible();
  await expect.element(screen.getByRole("table")).not.toBeInTheDocument();
});

test("shows an empty-results message when the query passes but matches nothing", async () => {
  mock({
    validation: { valid: true, violations: [], checked_rules: [] },
    columns: ["legal_name"],
    rows: [],
  });

  const screen = await render(<SqlTab />);
  await screen.getByLabelText(/sql/i).fill("SELECT legal_name FROM counterparties WHERE 1=0");
  await screen.getByRole("button", { name: /run/i }).click();

  await expect.element(screen.getByText(/no rows/i)).toBeVisible();
});
