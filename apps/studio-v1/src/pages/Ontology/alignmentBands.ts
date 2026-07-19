import type { AlignmentQueue, AlignmentReviewItem } from "@/api/ontology";

export interface AlignmentBands {
  review: AlignmentReviewItem[];
  auto: AlignmentReviewItem[];
  rejected: AlignmentReviewItem[];
  unmapped: AlignmentReviewItem[];
}

/** Split the flat queue into its confidence bands, preserving order. */
export function groupByBand(queue: AlignmentQueue): AlignmentBands {
  return {
    review: queue.items.filter((item) => item.band === "review"),
    auto: queue.items.filter((item) => item.band === "auto"),
    rejected: queue.items.filter((item) => item.band === "rejected"),
    unmapped: queue.items.filter((item) => item.band === "unmapped"),
  };
}
