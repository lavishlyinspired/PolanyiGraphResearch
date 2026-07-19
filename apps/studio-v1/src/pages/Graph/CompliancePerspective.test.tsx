import { render } from "vitest-browser-react";
import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { worker } from "../../../vitest.browser.setup";
import { CompliancePerspective } from "./CompliancePerspective";

function mockCompliance() {
  worker.use(
    http.get("/api/rules", () =>
      HttpResponse.json([
        {
          rule_id: "BR-001",
          name: "Sanctioned Check",
          description: "Trades must exclude sanctioned counterparties.",
          severity: "CRITICAL",
          sql_hints: ["is_sanctioned"],
          affected_entities: ["trades", "counterparties"],
        },
      ]),
    ),
    http.get("/api/compliance/summary", () =>
      HttpResponse.json({
        window_days: 30,
        rules: [{ rule_id: "BR-001", rule_name: "Sanctioned Check", passed: 2, flagged: 0, blocked: 1 }],
        total_events: 3,
      }),
    ),
    http.get("/api/compliance/events", () =>
      HttpResponse.json([
        { rule_id: "BR-001", verdict: "blocked", sql: "SELECT * FROM trades", timestamp: "2026-07-19T12:00:00Z", source: "validate" },
      ]),
    ),
  );
}

test("shows real per-rule enforcement counts, not fabricated ones", async () => {
  mockCompliance();
  const screen = await render(<CompliancePerspective />);
  const summary = screen.getByRole("region", { name: /enforcement summary/i });
  await expect.element(summary.getByText(/2 passed \/ 0 flagged \/ 1 blocked/)).toBeVisible();
});

test("shows real recent enforcement events", async () => {
  mockCompliance();
  const screen = await render(<CompliancePerspective />);
  const events = screen.getByRole("region", { name: /recent enforcement events/i });
  await expect.element(events.getByText("BR-001", { exact: true })).toBeVisible();
  await expect.element(events.getByText(/blocked/i)).toBeVisible();
});

test("shows an honest empty state before any query has been validated", async () => {
  worker.use(
    http.get("/api/rules", () => HttpResponse.json([])),
    http.get("/api/compliance/summary", () => HttpResponse.json({ window_days: 30, rules: [], total_events: 0 })),
    http.get("/api/compliance/events", () => HttpResponse.json([])),
  );
  const screen = await render(<CompliancePerspective />);
  await expect.element(screen.getByText(/no queries have been validated yet/i)).toBeVisible();
});

test("clicking a rule node shows its real details in the inspector", async () => {
  mockCompliance();
  const screen = await render(<CompliancePerspective />);
  const canvas = screen.getByRole("group", { name: /compliance graph/i });
  await canvas.getByRole("button", { name: "BR-001", exact: true }).click();

  const inspector = screen.getByRole("region", { name: /inspector/i });
  await expect.element(inspector.getByRole("heading", { name: "BR-001" })).toBeVisible();
  await expect.element(inspector.getByText("CRITICAL")).toBeVisible();
  await expect.element(inspector.getByText(/trades, counterparties/)).toBeVisible();
});

test("defaults a rule with no enforcement history to 0/0 rather than fabricating a count", async () => {
  worker.use(
    http.get("/api/rules", () =>
      HttpResponse.json([
        {
          rule_id: "BR-999",
          name: "Untested Rule",
          description: "Never checked yet.",
          severity: "INFO",
          sql_hints: [],
          affected_entities: [],
        },
      ]),
    ),
    http.get("/api/compliance/summary", () => HttpResponse.json({ window_days: 30, rules: [], total_events: 0 })),
    http.get("/api/compliance/events", () => HttpResponse.json([])),
  );
  const screen = await render(<CompliancePerspective />);
  const summary = screen.getByRole("region", { name: /enforcement summary/i });
  await expect.element(summary.getByText(/0 passed \/ 0 flagged \/ 0 blocked/)).toBeVisible();
});
