import { useEffect, useState } from "react";
import "./tailwind.css";
import {
  acceptAlignment,
  fetchAlignmentQueue,
  GraphDBUnavailableError,
  rejectAlignment,
  type AlignmentQueue,
} from "@/api/ontology";
import { AlignmentDashboard, type BulkAcceptResult } from "./components/AlignmentDashboard";
import { OntologyGraph } from "./components/OntologyGraph";
import { ReconciliationPanel } from "./components/ReconciliationPanel";
import { TermDetail } from "./components/TermDetail";
import { TermList } from "./components/TermList";

type State =
  | { kind: "loading" }
  | { kind: "ready"; queue: AlignmentQueue }
  | { kind: "unavailable" }
  | { kind: "error" };

export function OntologyPage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchAlignmentQueue()
      .then((queue) => {
        if (!cancelled) setState({ kind: "ready", queue });
      })
      .catch((error) => {
        if (cancelled) return;
        setState(error instanceof GraphDBUnavailableError ? { kind: "unavailable" } : { kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Cross-source reconciliation doesn't depend on the FIBO alignment queue
  // (which can take a while against a large ontology) — it renders in every
  // state below rather than being gated behind the queue's own load/error.
  if (state.kind === "loading") {
    return (
      <main className="p-6">
        <p>Loading…</p>
        <div className="mt-4">
          <ReconciliationPanel />
        </div>
      </main>
    );
  }

  if (state.kind === "unavailable") {
    return (
      <main className="view">
        <div className="view-head">
          <h1>Ontology · FIBO</h1>
        </div>
        <div className="panel" style={{ padding: 16 }}>
          <p style={{ margin: 0 }}>
            This view requires GraphDB. Start it (<code>make up</code>) and republish the FIBO
            repository, then reload.
          </p>
        </div>
        <div className="mt-4">
          <ReconciliationPanel />
        </div>
      </main>
    );
  }

  if (state.kind === "error") {
    return (
      <main className="view">
        <div className="view-head">
          <h1>Ontology · FIBO</h1>
        </div>
        <div className="panel" style={{ padding: 16 }}>
          <p style={{ margin: 0 }}>Couldn&apos;t load the alignment queue.</p>
        </div>
        <div className="mt-4">
          <ReconciliationPanel />
        </div>
      </main>
    );
  }

  const { queue } = state;
  const selectedItem = queue.items.find((item) => item.term === selectedTerm) ?? null;

  function handleAccept(term: string, candidateUri: string) {
    void acceptAlignment(term, candidateUri)
      .then((next) => setState({ kind: "ready", queue: next }))
      .catch(() => setState({ kind: "error" }));
  }

  function handleReject(term: string, candidateUri: string) {
    void rejectAlignment(term, candidateUri)
      .then((next) => setState({ kind: "ready", queue: next }))
      .catch(() => setState({ kind: "error" }));
  }

  async function handleBulkAccept(thresholdPercent: number): Promise<BulkAcceptResult> {
    const eligible = queue.items.filter(
      (item) => item.band === "review" && item.score * 100 >= thresholdPercent,
    );
    let latest = queue;
    let accepted = 0;
    let failed = 0;
    for (const item of eligible) {
      try {
        latest = await acceptAlignment(item.term);
        accepted += 1;
      } catch {
        failed += 1;
      }
    }
    setState({ kind: "ready", queue: latest });
    return { accepted, failed };
  }

  return (
    <main className="p-6">
      <h1 className="mb-1 font-serif text-xl font-bold text-slate-900">Ontology · FIBO</h1>
      <p className="mb-4 text-sm text-slate-500">
        Every glossary term, grounded against the Financial Industry Business Ontology.
      </p>
      <div className="mb-4">
        <AlignmentDashboard queue={queue} onBulkAccept={handleBulkAccept} />
      </div>
      <div className="mb-4">
        <OntologyGraph queue={queue} selectedTerm={selectedTerm} onSelectTerm={setSelectedTerm} />
      </div>
      <div
        className="flex overflow-hidden rounded-xl border border-slate-200 bg-white"
        style={{ height: 420 }}
      >
        <TermList items={queue.items} selectedTerm={selectedTerm} onSelect={setSelectedTerm} />
        {selectedItem !== null ? (
          <TermDetail item={selectedItem} onAccept={handleAccept} onReject={handleReject} />
        ) : (
          <div className="flex-1 p-4 text-sm text-slate-400">
            Select a term to review its FIBO candidates.
          </div>
        )}
      </div>
      <div className="mt-4">
        <ReconciliationPanel />
      </div>
    </main>
  );
}
