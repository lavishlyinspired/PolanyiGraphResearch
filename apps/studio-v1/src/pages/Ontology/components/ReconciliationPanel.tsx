import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchSources, type Source } from "@/api/schema";
import {
  acceptTaxonomyMatch,
  fetchReconciliation,
  GraphDBUnavailableError,
  publishTaxonomyMatches,
  rejectTaxonomyMatch,
  type PublishResult,
  type ReconciliationResult,
} from "@/api/reconcile";

const bandBadgeVariant = {
  auto: "success",
  review: "warning",
  rejected: "danger",
  unmapped: "outline",
} as const;

type PublishState =
  | { kind: "idle" }
  | { kind: "publishing" }
  | { kind: "done"; result: PublishResult }
  | { kind: "unavailable" }
  | { kind: "error" };

export function ReconciliationPanel() {
  const [extraSources, setExtraSources] = useState<Source[] | null>(null);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [publishState, setPublishState] = useState<PublishState>({ kind: "idle" });

  useEffect(() => {
    void fetchSources().then((sources) => {
      // Databricks connections live outside state["extra_sources"] on the
      // backend (a separate catalog/schema browser, not a name+uri source),
      // so reconciliation -- which only reads extra_sources -- can't compare
      // against one; offering it here would 404 every time.
      const extras = sources.filter((s) => !s.is_primary && s.dialect !== "databricks");
      setExtraSources(extras);
      const first = extras[0];
      if (first) setSelectedSource(first.name);
    });
  }, []);

  const loadReconciliation = useCallback((source: string) => {
    setLoadError(false);
    void fetchReconciliation(source)
      .then(setResult)
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    if (selectedSource) {
      setPublishState({ kind: "idle" });
      loadReconciliation(selectedSource);
    }
  }, [selectedSource, loadReconciliation]);

  if (extraSources === null) {
    return null;
  }

  if (extraSources.length === 0) {
    return (
      <section aria-label="Cross-source reconciliation" className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-1 font-serif text-lg font-bold text-slate-900">Cross-Source Reconciliation</h2>
        <p className="text-sm text-slate-500">
          Connect a second source on the Data Sources page to reconcile terminology across it.
        </p>
      </section>
    );
  }

  function handleAccept(term: string) {
    if (!selectedSource) return;
    void acceptTaxonomyMatch(selectedSource, term).then(setResult);
  }

  function handleReject(term: string) {
    if (!selectedSource) return;
    void rejectTaxonomyMatch(selectedSource, term).then(setResult);
  }

  function handlePublish() {
    if (!selectedSource) return;
    setPublishState({ kind: "publishing" });
    void publishTaxonomyMatches(selectedSource)
      .then((publishResult) => setPublishState({ kind: "done", result: publishResult }))
      .catch((error) =>
        setPublishState(error instanceof GraphDBUnavailableError ? { kind: "unavailable" } : { kind: "error" }),
      );
  }

  return (
    <section aria-label="Cross-source reconciliation" className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-serif text-lg font-bold text-slate-900">Cross-Source Reconciliation</h2>
          <p className="text-sm text-slate-500">
            Candidate concept matches between the primary glossary and a connected source.
          </p>
        </div>
        <Button size="sm" onClick={handlePublish} disabled={publishState.kind === "publishing"}>
          Publish accepted matches
        </Button>
      </div>

      <div className="mb-3 flex flex-wrap gap-1">
        {extraSources.map((source) => (
          <Button
            key={source.name}
            size="sm"
            variant={selectedSource === source.name ? "default" : "outline"}
            onClick={() => setSelectedSource(source.name)}
          >
            {source.name}
          </Button>
        ))}
      </div>

      {publishState.kind === "done" && (
        <p className="mb-3 text-sm text-emerald-700">
          Published {publishState.result.triples} triple{publishState.result.triples === 1 ? "" : "s"} to{" "}
          {publishState.result.named_graph}.
        </p>
      )}
      {publishState.kind === "unavailable" && (
        <p className="mb-3 text-sm text-rose-600">Publishing requires GraphDB. Start it and try again.</p>
      )}
      {publishState.kind === "error" && (
        <p className="mb-3 text-sm text-rose-600">Publishing failed.</p>
      )}

      {loadError && (
        <p className="mb-3 text-sm text-rose-600">Couldn&apos;t load matches for this source.</p>
      )}

      <ul aria-label="Taxonomy matches" className="divide-y divide-slate-100">
        {(result?.matches ?? []).map((match) => (
          <li
            key={match.source}
            aria-label={match.source}
            className="flex items-center justify-between gap-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium text-slate-900">{match.source}</span>
              <span className="mx-2 text-slate-300">&rarr;</span>
              <span className="text-sm text-slate-600">{match.target}</span>
            </div>
            <span className="text-xs text-slate-400">{match.confidence.toFixed(2)}</span>
            <Badge variant={bandBadgeVariant[match.band]}>{match.band}</Badge>
            {match.band === "review" && (
              <div className="flex shrink-0 gap-1">
                <Button size="sm" onClick={() => handleAccept(match.source)}>
                  Accept
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleReject(match.source)}>
                  Reject
                </Button>
              </div>
            )}
          </li>
        ))}
        {result !== null && result.matches.length === 0 && (
          <p className="py-3 text-sm text-slate-400">No candidate matches between these two sources.</p>
        )}
      </ul>
    </section>
  );
}
