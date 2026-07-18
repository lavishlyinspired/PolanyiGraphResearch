import { render } from "vitest-browser-react";
import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { worker } from "../../../vitest.browser.setup";
import { CORRECTED_SQL, ValidatorPage, VIOLATING_SQL } from "./ValidatorPage";

const rules: unknown[] = [];

test("Validate is disabled when the SQL box is empty or whitespace-only", async () => {
  const screen = await render(<ValidatorPage />);
  await expect.element(screen.getByRole("button", { name: /validate/i })).toBeDisabled();

  await screen.getByLabelText(/sql/i).fill("   ");
  await expect.element(screen.getByRole("button", { name: /validate/i })).toBeDisabled();

  await screen.getByLabelText(/sql/i).fill("SELECT 1");
  await expect.element(screen.getByRole("button", { name: /validate/i })).toBeEnabled();
});

test("shows an error panel with a retry action when the API request fails", async () => {
  worker.use(
    http.post("/api/validate", () => HttpResponse.json({ detail: "boom" }, { status: 500 })),
    http.get("/api/rules", () => HttpResponse.json(rules)),
  );

  const screen = await render(<ValidatorPage />);
  await screen.getByLabelText(/sql/i).fill("SELECT 1");
  await screen.getByRole("button", { name: /validate/i }).click();

  await expect.element(screen.getByText(/couldn.t validate/i)).toBeVisible();
  await expect.element(screen.getByRole("button", { name: /retry/i })).toBeVisible();
});

test("retry re-issues the request and can recover to a normal verdict", async () => {
  let attempt = 0;
  worker.use(
    http.post("/api/validate", () => {
      attempt += 1;
      if (attempt === 1) {
        return HttpResponse.json({ detail: "boom" }, { status: 500 });
      }
      return HttpResponse.json({ valid: true, violations: [], checked_rules: [] });
    }),
    http.get("/api/rules", () => HttpResponse.json(rules)),
  );

  const screen = await render(<ValidatorPage />);
  await screen.getByLabelText(/sql/i).fill("SELECT 1");
  await screen.getByRole("button", { name: /validate/i }).click();
  await expect.element(screen.getByRole("button", { name: /retry/i })).toBeVisible();

  await screen.getByRole("button", { name: /retry/i }).click();
  await expect.element(screen.getByRole("status")).toHaveTextContent(/^PASSED$/);
});

test("a non-SELECT statement shows the GUARD-DML blocked row", async () => {
  worker.use(
    http.post("/api/validate", () =>
      HttpResponse.json({
        valid: false,
        violations: [
          {
            rule_id: "GUARD-DML",
            severity: "CRITICAL",
            message: "Only read-only SELECT statements are allowed; got 'DELETE'.",
          },
        ],
        checked_rules: [],
      }),
    ),
    http.get("/api/rules", () => HttpResponse.json(rules)),
  );

  const screen = await render(<ValidatorPage />);
  await screen.getByLabelText(/sql/i).fill("DELETE FROM trades");
  await screen.getByRole("button", { name: /validate/i }).click();

  await expect.element(screen.getByText(/only read-only select/i)).toBeVisible();
});

test("shows the known-limitation note and the CLI equivalence line", async () => {
  const screen = await render(<ValidatorPage />);
  await expect.element(screen.getByText(/checked against rules/i)).toBeVisible();
  await expect.element(screen.getByText(/polanyi validate/)).toBeVisible();
});

test("example presets fill the SQL box with the violating and corrected queries", async () => {
  const screen = await render(<ValidatorPage />);
  const box = screen.getByLabelText(/sql/i);

  await screen.getByRole("button", { name: /violating query/i }).click();
  await expect.element(box).toHaveValue(VIOLATING_SQL);

  await screen.getByRole("button", { name: /corrected query/i }).click();
  await expect.element(box).toHaveValue(CORRECTED_SQL);
});
