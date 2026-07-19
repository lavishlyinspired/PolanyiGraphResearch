import { describe, expect, test } from "vitest";
import { groupByBand } from "./alignmentBands";
import { alignmentQueueSchema, alignmentReviewItemSchema, type AlignmentReviewItem } from "@/api/ontology";

function makeItem(overrides: Partial<AlignmentReviewItem> = {}): AlignmentReviewItem {
  return alignmentReviewItemSchema.parse({
    term: "Counterparty",
    band: "auto",
    candidate_label: "Counterparty",
    candidate_uri: "urn:fibo:Counterparty",
    score: 0.97,
    ...overrides,
  });
}

describe("groupByBand", () => {
  test("routes each item to the band matching its own band field", () => {
    const auto = makeItem({ term: "Currency", band: "auto" });
    const review = makeItem({ term: "Revenue", band: "review", score: 0.61 });
    const rejected = makeItem({ term: "Bond", band: "rejected", score: 0.61 });
    const unmapped = makeItem({ term: "Desk", band: "unmapped", candidate_uri: null, score: 0 });
    const bands = groupByBand(alignmentQueueSchema.parse({ items: [auto, review, rejected, unmapped] }));

    expect(bands.auto).toEqual([auto]);
    expect(bands.review).toEqual([review]);
    expect(bands.rejected).toEqual([rejected]);
    expect(bands.unmapped).toEqual([unmapped]);
  });

  test("keeps multiple items within a band and preserves their order", () => {
    const first = makeItem({ term: "Currency", band: "review", score: 0.7 });
    const second = makeItem({ term: "Revenue", band: "review", score: 0.61 });
    const bands = groupByBand(alignmentQueueSchema.parse({ items: [first, second] }));

    expect(bands.review).toEqual([first, second]);
    expect(bands.auto).toEqual([]);
    expect(bands.unmapped).toEqual([]);
  });

  test("returns empty bands for an empty queue", () => {
    const bands = groupByBand(alignmentQueueSchema.parse({ items: [] }));
    expect(bands).toEqual({ review: [], auto: [], rejected: [], unmapped: [] });
  });
});
