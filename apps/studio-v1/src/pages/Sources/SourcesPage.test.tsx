import { render } from "vitest-browser-react";
import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { worker } from "../../../vitest.browser.setup";
import { SourcesPage } from "./SourcesPage";

const sources = [
  {
    name: "demo.db",
    dialect: "sqlite",
    kind: "SQLite",
    uri: "sqlite:///semantics/knowledge/demo.db",
    table_count: 5,
    status: "connected",
    last_introspected: "2 h ago",
    objects_label: "5 tables",
    is_primary: true,
    removable: false,
  },
];

const emptyContext = {
  domain: "Financial Services",
  glossary: [],
  business_rules: [],
  key_entities: [],
  generated_by: "deterministic",
};

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
    http.get("/api/context", () => HttpResponse.json(emptyContext)),
  );
}

test("lists connected sources with their table count", async () => {
  mock();
  const screen = await render(<SourcesPage />);

  await expect.element(screen.getByText("demo.db", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("SQLite", { exact: true })).toBeVisible();
  await expect.element(screen.getByText(/connected/)).toBeVisible();
});

test("defaults the schema browser to the first table and shows its columns", async () => {
  mock();
  const screen = await render(<SourcesPage />);

  await expect.element(screen.getByRole("cell", { name: "trade_id" })).toBeVisible();
  await expect.element(screen.getByRole("cell", { name: "counterparty_id" })).toBeVisible();
});

test("hides the Semantic term column until the context has real FIBO enrichment", async () => {
  mock(); // emptyContext has no glossary entries — nothing is ever aligned
  const screen = await render(<SourcesPage />);

  await expect
    .element(screen.getByRole("columnheader", { name: /semantic term/i }))
    .not.toBeInTheDocument();
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

  await screen.getByRole("option", { name: /counterparties/i }).click();

  await expect.element(screen.getByRole("cell", { name: "legal_name" })).toBeVisible();
  await expect.element(screen.getByRole("cell", { name: "trade_id" })).not.toBeInTheDocument();
});

const databricksOnlySources = [
  {
    name: "dbc-a541b96d-b43f",
    dialect: "databricks",
    kind: "Databricks · Unity Catalog",
    uri: "https://dbc-a541b96d-b43f.cloud.databricks.com",
    table_count: 0,
    status: "connected",
    last_introspected: null,
    objects_label: "3 catalogs",
    is_primary: false,
    removable: false,
    catalog: null,
    schema_name: null,
  },
];

const databricksStatus = {
  connected: true,
  host: "https://dbc-a541b96d-b43f.cloud.databricks.com",
  catalogs: ["workspace", "graphos", "system"],
  error: null,
};

const databricksSchemas = {
  schemas: ["default", "raw", "curated"],
};

const databricksSchema = {
  dialect: "databricks",
  tables: [
    {
      name: "trades",
      columns: [
        { name: "trade_id", type: "BIGINT", nullable: false, primary_key: false },
        { name: "counterparty_id", type: "BIGINT", nullable: false, primary_key: false },
        { name: "notional_amount", type: "DECIMAL(18,2)", nullable: false, primary_key: false },
      ],
      foreign_keys: [],
    },
  ],
};

function mockDatabricks() {
  worker.use(
    http.get("/api/sources", () => HttpResponse.json(databricksOnlySources)),
    http.get("/api/databricks/status", () => HttpResponse.json(databricksStatus)),
    http.get("/api/databricks/schemas", ({ request }) => {
      const url = new URL(request.url);
      if (url.searchParams.get("catalog") === "graphos") {
        return HttpResponse.json(databricksSchemas);
      }
      return HttpResponse.json({ schemas: [] });
    }),
    http.get("/api/schema", ({ request }) => {
      const url = new URL(request.url);
      if (url.searchParams.get("source") === "databricks") {
        return HttpResponse.json(databricksSchema);
      }
      return HttpResponse.json(schema);
    }),
    http.get("/api/context", () => HttpResponse.json(emptyContext)),
  );
}

test("shows Databricks source in connections list", async () => {
  mockDatabricks();
  const screen = await render(<SourcesPage />);

  await expect.element(screen.getByText("dbc-a541b96d-b43f", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("3 catalogs")).toBeVisible();
});

test("shows a 'not configured' message instead of an inline picker when no catalog/schema is set", async () => {
  mockDatabricks();
  const screen = await render(<SourcesPage />);

  await expect.element(screen.getByText(/not configured yet/i)).toBeVisible();
  await expect.element(screen.getByRole("combobox", { name: "Select catalog" })).not.toBeInTheDocument();
});

test("editing the Databricks connection to set a catalog and schema loads its real schema automatically", async () => {
  mockDatabricks();
  worker.use(
    http.patch("/api/sources/dbc-a541b96d-b43f", async ({ request }) => {
      const body = (await request.json()) as { catalog: string; schema_name: string };
      return HttpResponse.json([
        { ...databricksOnlySources[0], catalog: body.catalog, schema_name: body.schema_name },
      ]);
    }),
  );
  const screen = await render(<SourcesPage />);

  await screen.getByRole("button", { name: "Edit", exact: true }).click();
  await screen.getByRole("combobox", { name: /catalog/i }).selectOptions(["graphos"]);
  await expect.element(screen.getByRole("combobox", { name: /schema/i })).toBeVisible();
  await screen.getByRole("combobox", { name: /schema/i }).selectOptions(["default"]);
  await screen.getByRole("button", { name: /^save$/i }).click();

  await expect.element(screen.getByRole("option", { name: /trades/i })).toBeVisible();
});

test("Generate context shows a real result summary with next-step links, not just a fleeting toast", async () => {
  mock();
  worker.use(
    http.post("/api/context/generate", () =>
      HttpResponse.json({
        domain: "Financial Services",
        glossary: [{ term: "Notional Amount", definition: "The notional amount of a trade." }],
        relationships: [
          {
            from_entity: "trades",
            to_entity: "counterparties",
            relationship_type: "many-to-one",
            foreign_key: "counterparty_id",
            description: "...",
          },
        ],
        business_rules: [],
        key_entities: [],
        generated_by: "deterministic",
      }),
    ),
  );
  const screen = await render(<SourcesPage />);

  await screen.getByRole("button", { name: /generate context/i }).click();

  await expect.element(screen.getByText(/context generated/i)).toBeVisible();
  await expect.element(screen.getByText(/1 glossary terms · 1 entity relationships · 0 business rules/i)).toBeVisible();
  await expect.element(screen.getByRole("button", { name: /view semantic model/i })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: /try the validator/i })).toBeVisible();
});

test("shows a semantic term chip for a column mapped in the context glossary", async () => {
  mock();
  worker.use(
    http.get("/api/context", () =>
      HttpResponse.json({
        domain: "Financial Services",
        glossary: [
          {
            term: "Legal Name",
            definition: "The counterparty's legal name.",
            formula: null,
            source_tables: ["counterparties"],
            source_columns: ["legal_name"],
            unit: null,
            synonyms: [],
            // The Semantic term column only shows once the context has real
            // enrichment (FIBO alignment) — this is what makes it "enriched".
            ontology_class: "fibo-fbc-pas-fpas:LegalName",
            ontology_uri: "https://spec.edmcouncil.org/fibo/ontology/FBC/LegalName",
          },
        ],
        business_rules: [],
        key_entities: [],
        generated_by: "deterministic",
      }),
    ),
  );
  const screen = await render(<SourcesPage />);

  await screen.getByRole("option", { name: /counterparties/i }).click();

  await expect.element(screen.getByText("Legal Name", { exact: true })).toBeVisible();
  // counterparty_id has no matching glossary entry — must show a real "no term"
  // dash, not a fabricated one.
  await expect.element(screen.getByRole("cell", { name: "—", exact: true })).toBeVisible();
});

const connectedExtraSource = {
  name: "reporting-db",
  dialect: "sqlite",
  kind: "SQLite",
  uri: "sqlite:///other.db",
  table_count: 0,
  status: "configured",
  last_introspected: null,
  objects_label: "not introspected",
  is_primary: false,
  removable: true,
};

test("connecting a source persists it through the backend", async () => {
  mock();
  worker.use(
    http.post("/api/sources", () => HttpResponse.json([sources[0], connectedExtraSource])),
  );
  const screen = await render(<SourcesPage />);

  await screen.getByRole("button", { name: /connect source/i }).click();
  await screen.getByLabelText(/^name$/i).fill("reporting-db");
  await screen.getByLabelText(/connection uri/i).fill("sqlite:///other.db");
  await screen.getByRole("button", { name: /^connect$/i }).click();

  await expect.element(screen.getByText("reporting-db", { exact: true })).toBeVisible();
  await expect.element(screen.getByText(/click introspect to derive its schema/i)).toBeVisible();
});

test("connecting a Databricks source asks for host/warehouse/token separately and posts the built payload", async () => {
  mock();
  let capturedBody: unknown = null;
  worker.use(
    http.post("/api/sources", async ({ request }) => {
      capturedBody = await request.json();
      return HttpResponse.json([sources[0]]);
    }),
  );
  const screen = await render(<SourcesPage />);

  await screen.getByRole("button", { name: /connect source/i }).click();
  await screen.getByLabelText(/source type/i).selectOptions(["databricks"]);

  // No raw URI field for Databricks — separate fields instead.
  await expect.element(screen.getByLabelText(/connection uri/i)).not.toBeInTheDocument();

  await screen.getByLabelText(/^name$/i).fill("dbc");
  await screen.getByLabelText(/workspace host/i).fill("dbc-xxxx.cloud.databricks.com");
  await screen.getByLabelText(/warehouse id/i).fill("abc123");
  await screen.getByLabelText(/access token/i).fill("dapi-secret");
  await screen.getByRole("button", { name: /^connect$/i }).click();

  await expect.element(screen.getByText(/connected "dbc"/i)).toBeVisible();
  expect(capturedBody).toEqual({
    name: "dbc",
    kind: "databricks",
    host: "dbc-xxxx.cloud.databricks.com",
    warehouse_id: "abc123",
    token: "dapi-secret",
  });
});

test("shows a Disconnect button only for removable sources", async () => {
  mock();
  worker.use(http.get("/api/sources", () => HttpResponse.json([sources[0], connectedExtraSource])));
  const screen = await render(<SourcesPage />);

  await expect.element(screen.getByRole("button", { name: /disconnect/i })).toBeVisible();
});

test("disconnecting a source removes it from the connections list", async () => {
  mock();
  worker.use(
    http.get("/api/sources", () => HttpResponse.json([sources[0], connectedExtraSource])),
    http.delete("/api/sources/reporting-db", () => HttpResponse.json([sources[0]])),
  );
  const screen = await render(<SourcesPage />);

  await expect.element(screen.getByText("reporting-db", { exact: true })).toBeVisible();
  await screen.getByRole("button", { name: /disconnect/i }).click();

  await expect.element(screen.getByText("reporting-db", { exact: true })).not.toBeInTheDocument();
});

test("introspecting a newly connected source loads its real schema", async () => {
  mock();
  const introspectedSource = {
    ...connectedExtraSource,
    status: "connected",
    table_count: 1,
    last_introspected: "just now",
    objects_label: "1 tables",
  };
  worker.use(
    http.get("/api/sources", () => HttpResponse.json([sources[0], connectedExtraSource])),
    http.post("/api/sources/reporting-db/introspect", () =>
      HttpResponse.json([sources[0], introspectedSource]),
    ),
    http.get("/api/schema", ({ request }) => {
      const url = new URL(request.url);
      if (url.searchParams.get("name") === "reporting-db") {
        return HttpResponse.json({
          dialect: "sqlite",
          tables: [
            {
              name: "widgets",
              columns: [{ name: "widget_id", type: "INTEGER", nullable: false, primary_key: true }],
              foreign_keys: [],
            },
          ],
        });
      }
      return HttpResponse.json(schema);
    }),
  );
  const screen = await render(<SourcesPage />);

  await screen.getByText("reporting-db", { exact: true }).click();
  await expect.element(screen.getByText(/not yet introspected/i)).toBeVisible();

  await screen.getByRole("button", { name: "Introspect", exact: true }).click();

  await expect.element(screen.getByRole("option", { name: /widgets/i })).toBeVisible();
});

test("introspecting a user-connected source with dialect databricks runs real introspection, not the env-connection catalog refresh", async () => {
  mock();
  const configuredDbSource = {
    name: "dbc",
    dialect: "databricks",
    kind: "Databricks · Unity Catalog",
    uri: "databricks://token@host/sql/1.0/warehouses/abc",
    table_count: 0,
    status: "configured",
    last_introspected: null,
    objects_label: "not introspected",
    is_primary: false,
    removable: true,
  };
  const introspectedDbSource = {
    ...configuredDbSource,
    status: "connected",
    table_count: 1,
    last_introspected: "just now",
    objects_label: "1 tables",
  };
  worker.use(
    http.get("/api/sources", () => HttpResponse.json([sources[0], configuredDbSource])),
    http.post("/api/sources/dbc/introspect", () => HttpResponse.json([sources[0], introspectedDbSource])),
    http.get("/api/schema", ({ request }) => {
      const url = new URL(request.url);
      if (url.searchParams.get("name") === "dbc") {
        return HttpResponse.json({
          dialect: "databricks",
          tables: [
            {
              name: "events",
              columns: [{ name: "event_id", type: "bigint", nullable: false, primary_key: true }],
              foreign_keys: [],
            },
          ],
        });
      }
      return HttpResponse.json(schema);
    }),
  );
  const screen = await render(<SourcesPage />);

  await screen.getByText("dbc", { exact: true }).click();
  await expect.element(screen.getByText(/not yet introspected/i)).toBeVisible();

  await screen.getByRole("button", { name: "Introspect", exact: true }).click();

  await expect.element(screen.getByRole("option", { name: /events/i })).toBeVisible();
});

test("Edit prefills the primary source's current URI (no secrets to hide there)", async () => {
  mock();
  const screen = await render(<SourcesPage />);

  await screen.getByRole("button", { name: "Edit", exact: true }).click();

  await expect.element(screen.getByLabelText(/connection uri/i)).toHaveValue("sqlite:///semantics/knowledge/demo.db");
});

test("Edit is available for the primary source and lets you point at a different database", async () => {
  mock();
  const swappedSource = {
    ...sources[0],
    name: "swapped.db",
    uri: "sqlite:///swapped.db",
    table_count: 1,
  };
  worker.use(
    http.patch("/api/sources/demo.db", () => HttpResponse.json([swappedSource])),
    http.get("/api/schema", ({ request }) => {
      const url = new URL(request.url);
      if (url.searchParams.has("name")) return HttpResponse.json(schema);
      return HttpResponse.json({
        dialect: "sqlite",
        tables: [{ name: "gizmos", columns: [], foreign_keys: [] }],
      });
    }),
  );
  const screen = await render(<SourcesPage />);

  await screen.getByRole("button", { name: "Edit", exact: true }).click();
  await screen.getByLabelText(/connection uri/i).fill("sqlite:///swapped.db");
  await screen.getByRole("button", { name: /^save$/i }).click();

  await expect.element(screen.getByText("swapped.db", { exact: true })).toBeVisible();
  await expect.element(screen.getByRole("option", { name: /gizmos/i })).toBeVisible();
});

test("Edit for a removable extra source updates its URI and clears the stale schema", async () => {
  mock();
  worker.use(
    http.get("/api/sources", () => HttpResponse.json([sources[0], connectedExtraSource])),
    http.patch("/api/sources/reporting-db", () =>
      HttpResponse.json([sources[0], { ...connectedExtraSource, uri: "sqlite:///moved.db" }]),
    ),
  );
  const screen = await render(<SourcesPage />);

  await screen.getByText("reporting-db", { exact: true }).click();
  const editButtons = screen.getByRole("button", { name: "Edit", exact: true });
  await editButtons.nth(1).click();

  await screen.getByLabelText(/connection uri/i).fill("sqlite:///moved.db");
  await screen.getByRole("button", { name: /^save$/i }).click();

  await expect.element(screen.getByText("sqlite:///moved.db", { exact: true })).toBeVisible();
});
