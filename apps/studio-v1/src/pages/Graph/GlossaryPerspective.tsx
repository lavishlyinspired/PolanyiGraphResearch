import { useEffect, useState } from "react";
import { fetchAlignmentQueue, GraphDBUnavailableError, type AlignmentQueue } from "@/api/ontology";
import { fetchContext, type SemanticContext } from "@/api/context";
import { buildLayout } from "./graphLayout";
import { GraphCanvas } from "./GraphCanvas";
import { alignmentStats, buildAlignmentGraph, buildTermsTable, type TermAlignmentRow } from "./glossaryAlignment";

type State =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "error" }
  | { kind: "ready"; queue: AlignmentQueue; context: SemanticContext };

const nodeColor: Record<string, string> = {
  FIBO: "#6366f1",
  Term: "#059669",
  Entity: "#0891b2",
};

function bandLabel(band: string): string {
  if (band === "auto") return "auto-aligned";
  if (band === "review") return "needs review";
  return band;
}

export function GlossaryPerspective() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [selected, setSelected] = useState<TermAlignmentRow | null>(null);

  useEffect(() => {
    void Promise.all([fetchAlignmentQueue(), fetchContext()])
      .then(([queue, context]) => setState({ kind: "ready", queue, context }))
      .catch((error) => {
        setState(error instanceof GraphDBUnavailableError ? { kind: "unavailable" } : { kind: "error" });
      });
  }, []);

  if (state.kind === "loading") {
    return <p>Loading…</p>;
  }

  if (state.kind === "unavailable") {
    return (
      <div className="panel" style={{ padding: 16 }}>
        <p style={{ margin: 0 }}>This perspective requires GraphDB. Start it (make up), then reload.</p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="panel" style={{ padding: 16 }}>
        <p style={{ margin: 0 }}>Couldn&apos;t load the alignment data.</p>
      </div>
    );
  }

  const stats = alignmentStats(state.queue.items);
  const rows = buildTermsTable(state.queue.items, state.context.glossary);
  const graph = buildAlignmentGraph(state.queue.items, state.context.glossary);
  const layout = buildLayout(graph.nodes, graph.edges);

  return (
    <div>
      <ul role="list" aria-label="Legend" style={{ listStyle: "none", display: "flex", gap: 14, padding: 0 }}>
        {Object.keys(nodeColor).map((label) => (
          <li key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              aria-hidden="true"
              style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: nodeColor[label] }}
            />
            {label}
          </li>
        ))}
      </ul>

      <div style={{ display: "flex", gap: 18, marginTop: 12 }}>
        <GraphCanvas
          layout={layout}
          ariaLabel="Glossary alignment graph"
          colorFor={(label) => nodeColor[label] ?? "#94a3b8"}
          onSelectNode={(id) => {
            const node = graph.nodes.find((n) => n.id === id);
            const row = node !== undefined ? (rows.find((r) => r.term === node.name) ?? null) : null;
            setSelected(row);
          }}
        />

        <div style={{ width: 320 }}>
          <section aria-label="Alignment status" className="panel" style={{ marginBottom: 18, padding: 16 }}>
            <h2>Alignment status</h2>
            <p style={{ margin: "4px 0" }}>{stats.auto} auto-aligned</p>
            <p style={{ margin: "4px 0" }}>{stats.review} need review</p>
            <p style={{ margin: "4px 0" }}>{stats.rejected} rejected</p>
            <p style={{ margin: "4px 0" }}>{stats.unmapped} unmapped</p>
          </section>

          <section aria-label="Inspector" className="panel" style={{ padding: 16 }}>
            {selected === null ? (
              <p className="dim">Select a node to inspect it.</p>
            ) : (
              <>
                <h2>{selected.term}</h2>
                <p className="dim">{bandLabel(selected.band)}</p>
                <p style={{ margin: "4px 0" }}>
                  <b>FIBO class:</b> {selected.candidateLabel ?? "—"}
                </p>
                <p style={{ margin: "4px 0" }}>
                  <b>Confidence:</b> {selected.score.toFixed(2)}
                </p>
                <p style={{ margin: "4px 0" }}>
                  <b>Source tables:</b> {selected.sourceTables.length > 0 ? selected.sourceTables.join(", ") : "—"}
                </p>
              </>
            )}
          </section>
        </div>
      </div>

      <section aria-label="Terms and alignment" className="panel" style={{ marginTop: 18 }}>
        <div className="panel-h">
          <h2>Terms &amp; alignment</h2>
        </div>
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Term</th>
                <th>FIBO class</th>
                <th>Status</th>
                <th>Confidence</th>
                <th>Source tables</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.term}>
                  <td>
                    <b>{row.term}</b>
                  </td>
                  <td className="mono" style={{ fontSize: 11 }}>
                    {row.candidateLabel ?? "—"}
                  </td>
                  <td>{bandLabel(row.band)}</td>
                  <td>{row.score.toFixed(2)}</td>
                  <td className="dim">{row.sourceTables.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
