import { render } from "vitest-browser-react";
import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { worker } from "../../../vitest.browser.setup";
import { ValidatorPage } from "./ValidatorPage";

// Contract shape verified against packages/common/models.py (ValidationResult / Violation).
const blockedResult = {
  valid: false,
  violations: [
    {
      rule_id: "BR-001",
      severity: "CRITICAL",
      message:
        "Sanctioned Counterparty Check: query touches trades, counterparties but does not handle is_sanctioned.",
    },
  ],
  checked_rules: ["BR-001"],
};

const passedResult = {
  valid: true,
  violations: [],
  checked_rules: ["BR-001", "BR-002"],
};

const violatingSql =
  "SELECT c.name FROM trades t JOIN counterparties c ON t.counterparty_id = c.counterparty_id";

test("shows a BLOCKED verdict when the API reports the query is invalid", async () => {
  worker.use(http.post("/api/validate", () => HttpResponse.json(blockedResult)));

  const screen = await render(<ValidatorPage />);
  await screen.getByLabelText(/sql/i).fill(violatingSql);
  await screen.getByRole("button", { name: /validate/i }).click();

  await expect.element(screen.getByText(/blocked/i)).toBeVisible();
});

test("shows a PASSED verdict when the API reports the query is valid", async () => {
  worker.use(http.post("/api/validate", () => HttpResponse.json(passedResult)));

  const screen = await render(<ValidatorPage />);
  await screen.getByLabelText(/sql/i).fill("SELECT 1");
  await screen.getByRole("button", { name: /validate/i }).click();

  await expect.element(screen.getByText(/passed/i)).toBeVisible();
});
