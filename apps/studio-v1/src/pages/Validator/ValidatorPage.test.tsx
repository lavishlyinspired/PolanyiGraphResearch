import { render } from "vitest-browser-react";
import { http, HttpResponse, type JsonBodyType } from "msw";
import { expect, test } from "vitest";
import { worker } from "../../../vitest.browser.setup";
import { ValidatorPage } from "./ValidatorPage";

// Contract shapes verified against packages/common/models.py.
const rules = [
  {
    rule_id: "BR-001",
    name: "Sanctioned Counterparty Check",
    description: "Exclude sanctioned counterparties.",
    severity: "CRITICAL",
  },
  {
    rule_id: "BR-002",
    name: "Cancelled Trades Excluded",
    description: "Exclude cancelled trades from revenue.",
    severity: "CRITICAL",
  },
  {
    rule_id: "BR-004",
    name: "USD Normalization",
    description: "Convert to USD.",
    severity: "ADVISORY",
  },
];

function mock(validateBody: JsonBodyType) {
  worker.use(
    http.post("/api/validate", () => HttpResponse.json(validateBody)),
    http.get("/api/rules", () => HttpResponse.json(rules)),
  );
}

const violatingSql =
  "SELECT c.name FROM trades t JOIN counterparties c ON t.counterparty_id = c.counterparty_id";

test("shows a BLOCKED banner and a per-rule row with the rule name and its message", async () => {
  mock({
    valid: false,
    violations: [
      {
        rule_id: "BR-001",
        severity: "CRITICAL",
        message:
          "Sanctioned Counterparty Check: query does not handle is_sanctioned.",
      },
    ],
    checked_rules: ["BR-001"],
  });

  const screen = await render(<ValidatorPage />);
  await screen.getByLabelText(/sql/i).fill(violatingSql);
  await screen.getByRole("button", { name: /validate/i }).click();

  await expect.element(screen.getByRole("status")).toHaveTextContent(/blocked/i);
  await expect
    .element(screen.getByText("Sanctioned Counterparty Check", { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByText(/does not handle is_sanctioned/i))
    .toBeVisible();
});

test("shows PASSED WITH WARNINGS when only advisory violations remain", async () => {
  mock({
    valid: true,
    violations: [
      { rule_id: "BR-004", severity: "ADVISORY", message: "Convert to USD." },
    ],
    checked_rules: ["BR-004"],
  });

  const screen = await render(<ValidatorPage />);
  await screen.getByLabelText(/sql/i).fill("SELECT SUM(notional_amount) FROM trades");
  await screen.getByRole("button", { name: /validate/i }).click();

  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent(/passed with warnings/i);
});

test("shows PASSED and lists a pass row per checked rule when compliant", async () => {
  mock({
    valid: true,
    violations: [],
    checked_rules: ["BR-001", "BR-002"],
  });

  const screen = await render(<ValidatorPage />);
  await screen.getByLabelText(/sql/i).fill("SELECT 1");
  await screen.getByRole("button", { name: /validate/i }).click();

  await expect.element(screen.getByRole("status")).toHaveTextContent(/^PASSED$/);
  await expect
    .element(screen.getByText("Cancelled Trades Excluded"))
    .toBeVisible();
});
