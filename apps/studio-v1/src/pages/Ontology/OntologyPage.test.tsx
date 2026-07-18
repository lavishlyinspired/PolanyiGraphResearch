import { render } from "vitest-browser-react";
import { http, HttpResponse, type JsonBodyType } from "msw";
import { expect, test } from "vitest";
import { worker } from "../../../vitest.browser.setup";
import { OntologyPage } from "./OntologyPage";

function mockQueue(body: JsonBodyType) {
  worker.use(http.get("/api/context/align/queue", () => HttpResponse.json(body)));
}

const queueBody = {
  items: [
    { term: "Counterparty", band: "auto", candidate_label: "Counterparty", candidate_uri: "fibo:Counterparty", score: 0.97 },
    { term: "Revenue", band: "review", candidate_label: "RevenueBond", candidate_uri: "fibo:RevenueBond", score: 0.61 },
    { term: "Desk", band: "unmapped", candidate_label: null, candidate_uri: null, score: 0.0 },
  ],
};

test("groups terms into the three confidence bands with their scores", async () => {
  mockQueue(queueBody);
  const screen = await render(<OntologyPage />);

  const review = screen.getByRole("region", { name: /needs review/i });
  await expect.element(review.getByText("Revenue", { exact: true })).toBeVisible();
  await expect.element(review.getByText("0.61")).toBeVisible();

  const auto = screen.getByRole("region", { name: /^aligned/i });
  await expect.element(auto.getByText("Counterparty", { exact: true })).toBeVisible();

  const unmapped = screen.getByRole("region", { name: /unmapped/i });
  await expect.element(unmapped.getByText("Desk", { exact: true })).toBeVisible();
});

test("shows a needs-review count so a steward sees the queue size at a glance", async () => {
  mockQueue(queueBody);
  const screen = await render(<OntologyPage />);
  await expect.element(screen.getByRole("region", { name: /needs review/i })).toHaveTextContent("1");
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

test("rejecting a review candidate moves the term into the rejected band", async () => {
  mockQueue(queueBody);
  worker.use(
    http.post("/api/context/align/Revenue/reject", () =>
      HttpResponse.json({
        items: [
          { term: "Counterparty", band: "auto", candidate_label: "Counterparty", candidate_uri: "fibo:Counterparty", score: 0.97 },
          { term: "Revenue", band: "rejected", candidate_label: "RevenueBond", candidate_uri: "fibo:RevenueBond", score: 0.61 },
          { term: "Desk", band: "unmapped", candidate_label: null, candidate_uri: null, score: 0.0 },
        ],
      }),
    ),
  );

  const screen = await render(<OntologyPage />);
  const review = screen.getByRole("region", { name: /needs review/i });
  await review.getByRole("button", { name: /reject/i }).click();

  const rejected = screen.getByRole("region", { name: /rejected/i });
  await expect.element(rejected.getByText("Revenue", { exact: true })).toBeVisible();
  await expect
    .element(screen.getByRole("region", { name: /needs review · 0/i }))
    .toBeVisible();
});

test("accepting a review candidate moves the term into the aligned band", async () => {
  mockQueue(queueBody);
  // After accept, the server reports Revenue as aligned.
  worker.use(
    http.post("/api/context/align/Revenue/accept", () =>
      HttpResponse.json({
        items: [
          { term: "Counterparty", band: "auto", candidate_label: "Counterparty", candidate_uri: "fibo:Counterparty", score: 0.97 },
          { term: "Revenue", band: "auto", candidate_label: "RevenueBond", candidate_uri: "fibo:RevenueBond", score: 0.61 },
          { term: "Desk", band: "unmapped", candidate_label: null, candidate_uri: null, score: 0.0 },
        ],
      }),
    ),
  );

  const screen = await render(<OntologyPage />);
  const review = screen.getByRole("region", { name: /needs review/i });
  await review.getByRole("button", { name: /accept/i }).click();

  // Revenue is now under Aligned, and the review band is empty.
  const aligned = screen.getByRole("region", { name: /aligned/i });
  await expect.element(aligned.getByText("Revenue", { exact: true })).toBeVisible();
  await expect
    .element(screen.getByRole("region", { name: /needs review · 0/i }))
    .toBeVisible();
});
