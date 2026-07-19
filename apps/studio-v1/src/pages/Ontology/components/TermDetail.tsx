import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AlignmentReviewItem } from "@/api/ontology";

const bandLabel: Record<AlignmentReviewItem["band"], string> = {
  auto: "Aligned",
  review: "Needs review",
  rejected: "Rejected",
  unmapped: "Unmapped",
};

function scoreVariant(score: number): "success" | "warning" | "default" {
  if (score >= 0.9) return "success";
  if (score >= 0.5) return "warning";
  return "default";
}

type TermDetailProps = {
  item: AlignmentReviewItem;
  onAccept: (term: string, candidateUri: string) => void;
  onReject: (term: string, candidateUri: string) => void;
};

export function TermDetail({ item, onAccept, onReject }: TermDetailProps) {
  return (
    <section aria-label="Term detail" className="flex-1 overflow-y-auto p-4">
      <h2 className="font-serif text-lg font-bold text-slate-900">{item.term}</h2>
      <p className="mb-3 text-xs text-slate-500">{bandLabel[item.band]}</p>
      {item.candidates.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-400">
          No FIBO candidate found for this term.
        </p>
      ) : (
        <div className="space-y-3">
          {item.candidates.map((candidate) => (
            <Card key={candidate.uri} data-candidate-uri={candidate.uri}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-900">{candidate.label}</span>
                  <Badge variant={scoreVariant(candidate.score)}>{candidate.score.toFixed(2)}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {candidate.method} — {candidate.rationale || "no rationale available"}
                </p>
                {item.band === "review" && (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => onAccept(item.term, candidate.uri)}>
                      Accept
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onReject(item.term, candidate.uri)}>
                      Reject
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
