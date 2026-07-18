import { useEffect, useState } from "react";
import {
  acceptAlignment,
  fetchAlignmentQueue,
  GraphDBUnavailableError,
  rejectAlignment,
  type AlignmentQueue,
  type AlignmentReviewItem,
} from "@/api/ontology";
import { groupByBand } from "./alignmentBands";

type State =
  | { kind: "loading" }
  | { kind: "ready"; queue: AlignmentQueue }
  | { kind: "unavailable" }
  | { kind: "error" };

function BandTable({
  label,
  hint,
  items,
  showCandidate,
  onAccept,
  onReject,
}: {
  label: string;
  hint: string;
  items: AlignmentReviewItem[];
  showCandidate: boolean;
  onAccept?: (term: string) => void;
  onReject?: (term: string) => void;
}) {
  const hasActions = onAccept !== undefined || onReject !== undefined;
  return (
    <section className="panel" aria-label={`${label} · ${items.length}`} style={{ marginBottom: 18 }}>
      <div className="panel-h">
        <h2>
          {label} · {items.length}
        </h2>
        <span className="hint">{hint}</span>
      </div>
      {items.length === 0 ? (
        <p className="dim" style={{ padding: 14, margin: 0 }}>
          Nothing in this band.
        </p>
      ) : (
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Term</th>
                {showCandidate && <th scope="col">FIBO candidate</th>}
                <th scope="col" className="num">
                  Score
                </th>
                {hasActions && <th scope="col">Decision</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.term}>
                  <td>
                    <b>{item.term}</b>
                  </td>
                  {showCandidate && (
                    <td>
                      {item.candidate_uri === null ? (
                        <span className="dim">—</span>
                      ) : (
                        <code>{item.candidate_uri}</code>
                      )}
                    </td>
                  )}
                  <td className="num">{item.score.toFixed(2)}</td>
                  {hasActions && (
                    <td style={{ display: "flex", gap: 8, whiteSpace: "nowrap" }}>
                      {onAccept !== undefined && (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={() => onAccept(item.term)}
                        >
                          Accept
                        </button>
                      )}
                      {onReject !== undefined && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => onReject(item.term)}
                        >
                          Reject
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function OntologyPage() {
  const [state, setState] = useState<State>({ kind: "loading" });

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

  if (state.kind === "loading") {
    return <p>Loading…</p>;
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
      </main>
    );
  }

  const bands = groupByBand(state.queue);

  function handleAccept(term: string) {
    void acceptAlignment(term)
      .then((queue) => setState({ kind: "ready", queue }))
      .catch(() => setState({ kind: "error" }));
  }

  function handleReject(term: string) {
    void rejectAlignment(term)
      .then((queue) => setState({ kind: "ready", queue }))
      .catch(() => setState({ kind: "error" }));
  }

  return (
    <main className="view">
      <div className="view-head">
        <div>
          <h1>Ontology · FIBO</h1>
          <p className="sub">
            Every glossary term, bucketed by lexical alignment confidence. ≥ 0.90 auto-aligns; 0.50–0.89
            needs a human decision; below that is unmapped. Deterministic — no model invents a class.
          </p>
        </div>
      </div>

      <BandTable
        label="Needs review"
        hint="0.50–0.89 · awaiting a decision"
        items={bands.review}
        showCandidate
        onAccept={handleAccept}
        onReject={handleReject}
      />
      <BandTable
        label="Aligned"
        hint="published · skos:exactMatch"
        items={bands.auto}
        showCandidate
      />
      <BandTable
        label="Rejected"
        hint="precision-first · not re-suggested"
        items={bands.rejected}
        showCandidate
      />
      <BandTable
        label="Unmapped"
        hint="< 0.50 · no confident candidate"
        items={bands.unmapped}
        showCandidate={false}
      />
    </main>
  );
}
