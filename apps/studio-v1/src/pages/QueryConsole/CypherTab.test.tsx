import { render } from "vitest-browser-react";
import { http, HttpResponse, type JsonBodyType } from "msw";
import { expect, test } from "vitest";
import { worker } from "../../../vitest.browser.setup";
import { CypherTab } from "./CypherTab";

function mock(status: number, body: JsonBodyType) {
  worker.use(http.post("/api/graph/query", () => HttpResponse.json(body, { status })));
}

test("shows structured rows when a read query succeeds", async () => {
  mock(200, { rows: [{ name: "Counterparty" }, { name: "Trade" }] });

  const screen = await render(<CypherTab />);
  await screen.getByLabelText(/cypher/i).fill("MATCH (t:Term) RETURN t.name AS name");
  await screen.getByRole("button", { name: /run/i }).click();

  await expect.element(screen.getByText(/name: counterparty/i)).toBeVisible();
  await expect.element(screen.getByText(/name: trade/i)).toBeVisible();
});

test("shows the rejection message when a write query is guarded off", async () => {
  mock(400, { detail: "Only read-only Cypher is allowed; found 'CREATE'." });

  const screen = await render(<CypherTab />);
  await screen.getByLabelText(/cypher/i).fill("CREATE (n:Rogue) RETURN n");
  await screen.getByRole("button", { name: /run/i }).click();

  await expect.element(screen.getByText(/only read-only cypher is allowed/i)).toBeVisible();
});
