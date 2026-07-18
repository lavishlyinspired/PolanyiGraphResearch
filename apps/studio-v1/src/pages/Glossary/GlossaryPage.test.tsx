import { render } from "vitest-browser-react";
import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { worker } from "../../../vitest.browser.setup";
import { GlossaryPage } from "./GlossaryPage";

const context = {
  domain: "Financial Services",
  glossary: [
    {
      term: "Counterparty",
      definition: "The legal entity on the other side of a trade.",
      formula: null,
      source_tables: ["trades", "counterparties"],
      source_columns: ["counterparty_id"],
      unit: null,
      synonyms: ["cpty"],
      ontology_class: "fibo-fbc-pas-fpas:Counterparty",
      ontology_uri: "https://fibo/Counterparty",
    },
    {
      term: "Risk Score",
      definition: "Composite daily risk metric.",
      formula: null,
      source_tables: ["risk_metrics"],
      source_columns: ["score"],
      unit: null,
      synonyms: [],
      ontology_class: null,
      ontology_uri: null,
    },
  ],
  relationships: [
    {
      from_entity: "trades",
      to_entity: "counterparties",
      relationship_type: "many-to-one",
      foreign_key: "counterparty_id",
      description: "Each trades row references one counterparties row via counterparty_id.",
    },
    {
      from_entity: "risk_metrics",
      to_entity: "counterparties",
      relationship_type: "many-to-one",
      foreign_key: "counterparty_id",
      description: "Each risk_metrics row references one counterparties row via counterparty_id.",
    },
  ],
  business_rules: [
    {
      rule_id: "BR-001",
      name: "Sanctioned Counterparty Check",
      description: "Exclude sanctioned counterparties.",
      severity: "CRITICAL",
      sql_hints: [],
      affected_entities: ["trades", "counterparties"],
    },
  ],
  key_entities: ["trades", "counterparties", "risk_metrics"],
  generated_by: "llm",
};

function mock() {
  worker.use(http.get("/api/context", () => HttpResponse.json(context)));
}

test("lists every glossary term with its FIBO alignment status", async () => {
  mock();
  const screen = await render(<GlossaryPage />);

  await expect
    .element(screen.getByRole("cell", { name: "Counterparty", exact: true }))
    .toBeVisible();
  await expect.element(screen.getByText("Counterparty", { exact: true })).toBeVisible();
  await expect.element(screen.getByText(/not aligned/i)).toBeVisible();
});

test("opens a term drawer showing definition, FIBO URI, and governing rules", async () => {
  mock();
  const screen = await render(<GlossaryPage />);

  await screen.getByRole("button", { name: /^counterparty$/i }).click();

  const drawer = screen.getByLabelText("Term detail");
  await expect
    .element(drawer.getByText("The legal entity on the other side of a trade."))
    .toBeVisible();
  await expect.element(drawer.getByText("https://fibo/Counterparty")).toBeVisible();
  await expect
    .element(drawer.getByText("Sanctioned Counterparty Check", { exact: true }))
    .toBeVisible();
});

test("a term with no rules touching its tables shows no governing rules, not a fabricated one", async () => {
  mock();
  const screen = await render(<GlossaryPage />);

  await screen.getByRole("button", { name: /risk score/i }).click();

  await expect.element(screen.getByText(/no rules govern this term/i)).toBeVisible();
});

test("there is no way to edit a term — read-only by design", async () => {
  mock();
  const screen = await render(<GlossaryPage />);

  await expect.element(screen.getByRole("textbox")).not.toBeInTheDocument();
  await expect.element(screen.getByRole("button", { name: /^edit/i })).not.toBeInTheDocument();
});

test("tab labels show real counts for glossary terms, key entities, and relationships", async () => {
  mock();
  const screen = await render(<GlossaryPage />);

  await expect.element(screen.getByRole("tab", { name: "Glossary · 2" })).toBeVisible();
  await expect
    .element(screen.getByRole("tab", { name: "Entities & relationships · 3 / 2" }))
    .toBeVisible();
});

test("Entities & relationships tab shows real key entities and FK relationships", async () => {
  mock();
  const screen = await render(<GlossaryPage />);

  await screen.getByRole("tab", { name: /entities & relationships/i }).click();

  const entitiesPanel = screen.getByLabelText("Key entities");
  await expect.element(entitiesPanel.getByText("risk_metrics", { exact: true })).toBeVisible();

  const relationshipsPanel = screen.getByLabelText("Relationships");
  await expect.element(relationshipsPanel.getByRole("cell", { name: "trades" })).toBeVisible();
  await expect.element(relationshipsPanel.getByRole("cell", { name: "counterparty_id" }).first()).toBeVisible();
});
