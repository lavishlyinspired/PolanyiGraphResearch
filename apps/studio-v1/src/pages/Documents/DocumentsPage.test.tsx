import { render } from "vitest-browser-react";
import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";
import { worker } from "../../../vitest.browser.setup";
import { DocumentsPage } from "./DocumentsPage";

const SAMPLE_TEXT = "Acme Bank Corp reported a Notional Amount of $2.5 million.";

async function ingest(screen: Awaited<ReturnType<typeof render>>, text = SAMPLE_TEXT) {
  await screen.getByLabelText(/title/i).fill("Q1 Memo");
  await screen.getByLabelText(/document text/i).fill(text);
  await screen.getByRole("button", { name: /ingest document/i }).click();
}

test("ingesting real text shows the pipeline strip, extractor chip, and mention counts", async () => {
  worker.use(
    http.post("/api/documents/ingest", () =>
      HttpResponse.json({
        mentions: [
          { text: "Acme Bank Corp", entity_type: "Organization", context: "", resolved_term: null },
          { text: "Notional Amount", entity_type: "Metric", context: "", resolved_term: "Notional Amount" },
        ],
        triples: 12,
        extractor: "HeuristicExtractor",
        published_uri: null,
      }),
    ),
  );

  const screen = await render(<DocumentsPage />);
  await ingest(screen);

  const pipeline = screen.getByRole("list", { name: /ingestion pipeline/i });
  await expect.element(screen.getByText(/heuristic/i)).toBeVisible();
  await expect.element(screen.getByText(/2 mentions/i)).toBeVisible();
  await expect.element(screen.getByText(/1 resolved/i)).toBeVisible();
  await expect.element(pipeline.getByText(/parse/i)).toBeVisible();
  await expect.element(pipeline.getByText(/publish/i)).toBeVisible();
});

test("highlights resolved and unresolved mentions in the original text", async () => {
  worker.use(
    http.post("/api/documents/ingest", () =>
      HttpResponse.json({
        mentions: [
          { text: "Acme Bank Corp", entity_type: "Organization", context: "", resolved_term: null },
          { text: "Notional Amount", entity_type: "Metric", context: "", resolved_term: "Notional Amount" },
        ],
        triples: 12,
        extractor: "HeuristicExtractor",
        published_uri: null,
      }),
    ),
  );

  const screen = await render(<DocumentsPage />);
  await ingest(screen);

  const resolvedMark = screen.getByText("Notional Amount", { exact: true });
  const unresolvedMark = screen.getByText("Acme Bank Corp", { exact: true });
  await expect.element(resolvedMark).toBeVisible();
  await expect.element(unresolvedMark).toBeVisible();
  await expect.element(resolvedMark).toHaveAttribute("data-mention-kind", "resolved");
  await expect.element(unresolvedMark).toHaveAttribute("data-mention-kind", "unresolved");
});

test("shows the published URN footer only when the document was actually published", async () => {
  worker.use(
    http.post("/api/documents/ingest", () =>
      HttpResponse.json({
        mentions: [],
        triples: 3,
        extractor: "HeuristicExtractor",
        published_uri: "https://polanyi.dev/document/q1-memo",
      }),
    ),
  );

  const screen = await render(<DocumentsPage />);
  await ingest(screen);

  await expect
    .element(screen.getByText("https://polanyi.dev/document/q1-memo"))
    .toBeVisible();
});

test("shows an honest note instead of a URN when the document was not published", async () => {
  worker.use(
    http.post("/api/documents/ingest", () =>
      HttpResponse.json({
        mentions: [],
        triples: 3,
        extractor: "HeuristicExtractor",
        published_uri: null,
      }),
    ),
  );

  const screen = await render(<DocumentsPage />);
  await ingest(screen);

  await expect.element(screen.getByText(/not published/i)).toBeVisible();
});

test("shows the real SHACL failure detail instead of a fabricated success", async () => {
  worker.use(
    http.post("/api/documents/ingest", () =>
      HttpResponse.json({ detail: "SHACL validation failed: Shape violation on gos:Mention" }, { status: 422 }),
    ),
  );

  const screen = await render(<DocumentsPage />);
  await ingest(screen);

  await expect.element(screen.getByText(/shape violation on gos:mention/i)).toBeVisible();
});

test("shows an honest error state for a generic failure", async () => {
  worker.use(http.post("/api/documents/ingest", () => HttpResponse.json({}, { status: 500 })));

  const screen = await render(<DocumentsPage />);
  await ingest(screen);

  await expect.element(screen.getByText(/couldn.t ingest/i)).toBeVisible();
});
