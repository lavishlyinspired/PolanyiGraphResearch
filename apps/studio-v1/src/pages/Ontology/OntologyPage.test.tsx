import { render } from "vitest-browser-react";
import { http, HttpResponse, type JsonBodyType } from "msw";
import { expect, test } from "vitest";
import { worker } from "../../../vitest.browser.setup";
import { OntologyPage } from "./OntologyPage";
import type { AlignmentQueue } from "@/api/ontology";

function mockQueue(body: JsonBodyType) {
  worker.use(http.get("/api/context/align/queue", () => HttpResponse.json(body)));
}

function getMockQueue(overrides?: Partial<AlignmentQueue>): AlignmentQueue {
  return {
    items: [
      {
        term: "Counterparty",
        band: "auto",
        candidate_label: "Counterparty",
        candidate_uri: "fibo:Counterparty",
        score: 0.97,
        candidates: [
          {
            uri: "fibo:Counterparty",
            label: "Counterparty",
            definition: "",
            score: 0.97,
            method: "lexical",
            rationale: "exact match; boosted +0.15 for 6 subclasses",
          },
        ],
      },
      {
        term: "Revenue",
        band: "review",
        candidate_label: "RevenueBond",
        candidate_uri: "fibo:RevenueBond",
        score: 0.61,
        candidates: [
          {
            uri: "fibo:RevenueBond",
            label: "RevenueBond",
            definition: "A bond secured by a specific revenue source.",
            score: 0.61,
            method: "lexical",
            rationale: "substring match",
          },
          {
            uri: "fibo:RevenueAccount",
            label: "RevenueAccount",
            definition: "",
            score: 0.55,
            method: "embedding",
            rationale: "",
          },
        ],
      },
      { term: "Desk", band: "unmapped", candidate_label: null, candidate_uri: null, score: 0.0, candidates: [] },
    ],
    ...overrides,
  };
}

test("shows real dashboard counts for each confidence band", async () => {
  mockQueue(getMockQueue());
  const screen = await render(<OntologyPage />);

  const dashboard = screen.getByRole("region", { name: /alignment summary/i });
  await expect.element(dashboard.getByText("1", { exact: true }).first()).toBeVisible();
  await expect.element(dashboard).toHaveTextContent("Aligned");
  await expect.element(dashboard).toHaveTextContent("Needs review");
  await expect.element(dashboard).toHaveTextContent("Unmapped");
});

test("cross-source reconciliation renders even while the alignment queue is still loading", async () => {
  // The alignment queue can take a long time against a large ontology --
  // reconciliation doesn't depend on it and must not be gated behind it.
  worker.use(http.get("/api/context/align/queue", () => new Promise(() => {})));
  worker.use(http.get("/api/sources", () => HttpResponse.json([])));

  const screen = await render(<OntologyPage />);
  await expect
    .element(screen.getByRole("region", { name: /cross-source reconciliation/i }))
    .toBeVisible();
});

test("shows an honest 'requires GraphDB' state when the endpoint returns 503", async () => {
  worker.use(
    http.get("/api/context/align/queue", () =>
      HttpResponse.json({ detail: "GRAPHDB_ENDPOINT not configured" }, { status: 503 }),
    ),
  );
  const screen = await render(<OntologyPage />);
  await expect.element(screen.getByText(/requires graphdb/i)).toBeVisible();
});

test("lists every term and lets a user search by name", async () => {
  mockQueue(getMockQueue());
  const screen = await render(<OntologyPage />);

  const list = screen.getByRole("list", { name: /glossary terms/i });
  await expect.element(list.getByText("Counterparty")).toBeVisible();
  await expect.element(list.getByText("Revenue")).toBeVisible();
  await expect.element(list.getByText("Desk")).toBeVisible();

  await screen.getByRole("searchbox", { name: /search terms/i }).fill("rev");
  await expect.element(list.getByText("Revenue")).toBeVisible();
  await expect.element(list.getByText("Desk")).not.toBeInTheDocument();
});

test("the unaligned filter hides already-aligned terms", async () => {
  mockQueue(getMockQueue());
  const screen = await render(<OntologyPage />);
  const list = screen.getByRole("list", { name: /glossary terms/i });

  await screen.getByRole("button", { name: /^unaligned$/i }).click();
  await expect.element(list.getByText("Counterparty")).not.toBeInTheDocument();
  await expect.element(list.getByText("Revenue")).toBeVisible();
});

test("selecting a term shows its real top candidates with score and rationale", async () => {
  mockQueue(getMockQueue());
  const screen = await render(<OntologyPage />);

  await screen.getByRole("list", { name: /glossary terms/i }).getByText("Revenue").click();

  const detail = screen.getByRole("region", { name: /^term detail$/i });
  await expect.element(detail.getByText("RevenueBond")).toBeVisible();
  await expect.element(detail.getByText("0.61")).toBeVisible();
  await expect.element(detail.getByText(/substring match/i)).toBeVisible();
  await expect.element(detail.getByText("RevenueAccount")).toBeVisible();
  await expect.element(detail.getByText(/embedding/i)).toBeVisible();
});

test("expanding a candidate's hierarchy shows real ancestors, descendants, and reasoner status", async () => {
  mockQueue(getMockQueue());
  worker.use(
    http.get("/api/ontology/reason", ({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get("uri")).toBe("fibo:RevenueBond");
      return HttpResponse.json({
        class: "fibo:RevenueBond",
        ancestors: [{ iri: "fibo:Bond", label: "Bond" }],
        descendants: [{ iri: "fibo:MunicipalRevenueBond", label: "Municipal Revenue Bond" }],
        reasoner: { ran: true, consistent: true, detail: "HermiT completed" },
      });
    }),
  );

  const screen = await render(<OntologyPage />);
  await screen.getByRole("list", { name: /glossary terms/i }).getByText("Revenue").click();
  const detail = screen.getByRole("region", { name: /^term detail$/i });

  await detail.getByRole("button", { name: /view hierarchy/i }).first().click();

  // exact matches: "Bond" alone would otherwise substring-match the
  // candidate's own "RevenueBond" label rendered elsewhere in this region.
  await expect.element(detail.getByText("Bond", { exact: true })).toBeVisible();
  await expect.element(detail.getByText("Municipal Revenue Bond", { exact: true })).toBeVisible();
  await expect.element(detail.getByText(/consistent/i)).toBeVisible();
});

test("shows an honest 'no Java runtime' message instead of fabricating a consistency result", async () => {
  mockQueue(getMockQueue());
  worker.use(
    http.get("/api/ontology/reason", () =>
      HttpResponse.json({
        class: "fibo:RevenueBond",
        ancestors: [],
        descendants: [],
        reasoner: {
          ran: false,
          consistent: null,
          detail: "No Java runtime found — HermiT/Pellet need Java. Structural hierarchy traversal remains available.",
        },
      }),
    ),
  );

  const screen = await render(<OntologyPage />);
  await screen.getByRole("list", { name: /glossary terms/i }).getByText("Revenue").click();
  const detail = screen.getByRole("region", { name: /^term detail$/i });
  await detail.getByRole("button", { name: /view hierarchy/i }).first().click();

  await expect.element(detail.getByText(/no java runtime/i)).toBeVisible();
});

test("shows an honest 'requires GraphDB' message when hierarchy reasoning is unavailable", async () => {
  mockQueue(getMockQueue());
  worker.use(
    http.get("/api/ontology/reason", () =>
      HttpResponse.json({ detail: "GRAPHDB_ENDPOINT not configured" }, { status: 503 }),
    ),
  );

  const screen = await render(<OntologyPage />);
  await screen.getByRole("list", { name: /glossary terms/i }).getByText("Revenue").click();
  const detail = screen.getByRole("region", { name: /^term detail$/i });
  await detail.getByRole("button", { name: /view hierarchy/i }).first().click();

  await expect.element(detail.getByText(/requires graphdb/i)).toBeVisible();
});

test("accepting a specific non-top candidate persists that exact candidate", async () => {
  mockQueue(getMockQueue());
  let capturedBody: unknown;
  worker.use(
    http.post("/api/context/align/Revenue/accept", async ({ request }) => {
      capturedBody = await request.json();
      return HttpResponse.json(
        getMockQueue({
          items: [
            ...getMockQueue().items.filter((i) => i.term !== "Revenue"),
            {
              term: "Revenue",
              band: "auto",
              candidate_label: "RevenueAccount",
              candidate_uri: "fibo:RevenueAccount",
              score: 0.9,
              candidates: [],
            },
          ],
        }),
      );
    }),
  );

  const screen = await render(<OntologyPage />);
  await screen.getByRole("list", { name: /glossary terms/i }).getByText("Revenue").click();

  const detail = screen.getByRole("region", { name: /^term detail$/i });
  const alternativeCard = detail.getByText("RevenueAccount").element().closest("[data-candidate-uri]");
  expect(alternativeCard).not.toBeNull();

  await detail
    .getByRole("button", { name: /accept/i })
    .nth(1)
    .click();

  // Wait for the accept's async round-trip to actually resolve (the mocked
  // response reports Revenue as aligned) before inspecting the captured body.
  await expect.element(detail.getByText(/^aligned$/i)).toBeVisible();
  expect(capturedBody).toEqual({ candidate_uri: "fibo:RevenueAccount" });
});

test("rejecting the displayed candidate moves the term to the rejected band in the list", async () => {
  mockQueue(getMockQueue());
  worker.use(
    http.post("/api/context/align/Revenue/reject", () =>
      HttpResponse.json(
        getMockQueue({
          items: [
            ...getMockQueue().items.filter((i) => i.term !== "Revenue"),
            {
              term: "Revenue",
              band: "rejected",
              candidate_label: "RevenueBond",
              candidate_uri: "fibo:RevenueBond",
              score: 0.61,
              candidates: [],
            },
          ],
        }),
      ),
    ),
  );

  const screen = await render(<OntologyPage />);
  await screen.getByRole("list", { name: /glossary terms/i }).getByText("Revenue").click();
  const detail = screen.getByRole("region", { name: /^term detail$/i });
  await detail.getByRole("button", { name: /reject/i }).first().click();

  await expect.element(detail.getByText(/rejected/i)).toBeVisible();
});

test("bulk-accepting above a threshold only accepts review terms meeting it", async () => {
  const twoReviewTerms = getMockQueue({
    items: [
      ...getMockQueue().items.filter((i) => i.band !== "review"),
      {
        term: "Revenue",
        band: "review",
        candidate_label: "RevenueBond",
        candidate_uri: "fibo:RevenueBond",
        score: 0.85,
        candidates: [],
      },
      {
        term: "Trade Date",
        band: "review",
        candidate_label: "TradeDate",
        candidate_uri: "fibo:TradeDate",
        score: 0.55,
        candidates: [],
      },
    ],
  });
  mockQueue(twoReviewTerms);

  const acceptedTerms: string[] = [];
  worker.use(
    http.post("/api/context/align/:term/accept", ({ params }) => {
      const term = decodeURIComponent(params.term as string);
      acceptedTerms.push(term);
      return HttpResponse.json(twoReviewTerms);
    }),
  );

  const screen = await render(<OntologyPage />);
  const dashboard = screen.getByRole("region", { name: /alignment summary/i });

  await dashboard.getByLabelText(/minimum confidence/i).fill("70");
  await dashboard.getByRole("button", { name: /accept all above threshold/i }).click();

  await expect.element(dashboard.getByText(/done/i)).toBeVisible();
  expect(acceptedTerms).toEqual(["Revenue"]);
});

test("bulk-accept reports per-term failures instead of failing silently", async () => {
  const twoReviewTerms = getMockQueue({
    items: [
      ...getMockQueue().items.filter((i) => i.band !== "review"),
      {
        term: "Revenue",
        band: "review",
        candidate_label: "RevenueBond",
        candidate_uri: "fibo:RevenueBond",
        score: 0.85,
        candidates: [],
      },
      {
        term: "Trade Date",
        band: "review",
        candidate_label: "TradeDate",
        candidate_uri: "fibo:TradeDate",
        score: 0.75,
        candidates: [],
      },
    ],
  });
  mockQueue(twoReviewTerms);

  worker.use(
    http.post("/api/context/align/:term/accept", ({ params }) => {
      const term = decodeURIComponent(params.term as string);
      if (term === "Trade Date") {
        return HttpResponse.json({ detail: "no candidate" }, { status: 404 });
      }
      return HttpResponse.json(twoReviewTerms);
    }),
  );

  const screen = await render(<OntologyPage />);
  const dashboard = screen.getByRole("region", { name: /alignment summary/i });

  await dashboard.getByLabelText(/minimum confidence/i).fill("70");
  await dashboard.getByRole("button", { name: /accept all above threshold/i }).click();

  await expect.element(dashboard.getByText(/1 failed/i)).toBeVisible();
});

test("renders a graph node for every term and syncs selection when a node is clicked", async () => {
  mockQueue(getMockQueue());
  const screen = await render(<OntologyPage />);

  const graph = screen.getByRole("group", { name: /alignment graph/i });
  const revenueNode = graph.getByRole("button", { name: "Revenue" });
  await expect.element(revenueNode).toBeVisible();

  await revenueNode.click();

  const detail = screen.getByRole("region", { name: /^term detail$/i });
  await expect.element(detail.getByText("RevenueBond")).toBeVisible();
});
