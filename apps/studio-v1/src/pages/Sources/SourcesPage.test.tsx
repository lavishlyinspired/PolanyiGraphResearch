import { render } from "vitest-browser-react";
import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { worker } from "../../../vitest.browser.setup";
import { SourcesPage } from "./SourcesPage";

const sources = [
  {
    name: "demo.db",
    dialect: "sqlite",
    uri: "sqlite:///semantics/knowledge/demo.db",
    table_count: 5,
    status: "connected",
  },
];

const schema = {
  dialect: "sqlite",
  tables: [
    {
      name: "trades",
      columns: [
        { name: "trade_id", type: "INTEGER", nullable: false, primary_key: true },
        { name: "counterparty_id", type: "INTEGER", nullable: false, primary_key: false },
      ],
      foreign_keys: [
        { column: "counterparty_id", references_table: "counterparties", references_column: "counterparty_id" },
      ],
    },
    {
      name: "counterparties",
      columns: [
        { name: "counterparty_id", type: "INTEGER", nullable: false, primary_key: true },
        { name: "legal_name", type: "TEXT", nullable: false, primary_key: false },
      ],
      foreign_keys: [],
    },
  ],
  table_info_text: "",
};

function mock() {
  worker.use(
    http.get("/api/sources", () => HttpResponse.json(sources)),
    http.get("/api/schema", () => HttpResponse.json(schema)),
  );
}

test("lists connected sources with their table count", async () => {
  mock();
  const screen = await render(<SourcesPage />);

  await expect.element(screen.getByText("demo.db", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("sqlite", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("connected", { exact: true })).toBeVisible();
});

test("defaults the schema browser to the first table and shows its columns", async () => {
  mock();
  const screen = await render(<SourcesPage />);

  await expect.element(screen.getByRole("cell", { name: "trade_id" })).toBeVisible();
  await expect.element(screen.getByRole("cell", { name: "counterparty_id" })).toBeVisible();
});

test("marks primary and foreign keys distinctly", async () => {
  mock();
  const screen = await render(<SourcesPage />);

  await expect.element(screen.getByText("PK", { exact: true })).toBeVisible();
  await expect.element(screen.getByText(/FK.*counterparties/)).toBeVisible();
});

test("switching tables shows that table's own columns", async () => {
  mock();
  const screen = await render(<SourcesPage />);

  await screen.getByRole("button", { name: /^counterparties$/i }).click();

  await expect.element(screen.getByRole("cell", { name: "legal_name" })).toBeVisible();
  await expect.element(screen.getByRole("cell", { name: "trade_id" })).not.toBeInTheDocument();
});
