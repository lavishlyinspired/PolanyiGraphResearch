import { useEffect, useState } from "react";
import { fetchGraphExplore, Neo4jUnavailableError, type GraphExplore, type GraphNode } from "@/api/graph";
import { fetchRules, type Rule } from "@/api/validation";
import { fetchContext, type SemanticContext } from "@/api/context";
import { buildLayout } from "./graphLayout";
import { GraphCanvas } from "./GraphCanvas";
import { buildDocumentSummary, buildMentionChains, filterDocumentGraph } from "./documentsGraph";

type State =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "error" }
  | { kind: "ready"; explore: GraphExplore; rules: Rule[]; context: SemanticContext };

const nodeColor: Record<string, string> = {
  Document: "#d97706",
  Mention: "#94a3b8",
  Term: "#6366f1",
};

export function DocumentsPerspective() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [selected, setSelected] = useState<GraphNode | null>(null);

  useEffect(() => {
    void Promise.all([fetchGraphExplore(), fetchRules(), fetchContext()])
      .then(([explore, rules, context]) => setState({ kind: "ready", explore, rules, context }))
      .catch((error) => {
        setState(error instanceof Neo4jUnavailableError ? { kind: "unavailable" } : { kind: "error" });
      });
  }, []);

  if (state.kind === "loading") {
    return <p>Loading…</p>;
  }

  if (state.kind === "unavailable") {
    return (
      <div className="panel" style={{ padding: 16 }}>
        <p style={{ margin: 0 }}>This perspective requires Neo4j. Start it (make up), then reload.</p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="panel" style={{ padding: 16 }}>
        <p style={{ margin: 0 }}>Couldn&apos;t load document data.</p>
      </div>
    );
  }

  const filtered = filterDocumentGraph(state.explore);
  const layout = buildLayout(filtered.nodes, filtered.edges);
  const summary = buildDocumentSummary(state.explore);
  const chains = buildMentionChains(state.explore, state.rules, state.context.glossary);

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
        <li style={{ marginLeft: "auto", color: "var(--ink-3)" }}>
          {summary.length} documents · {chains.length} mentions ·{" "}
          {chains.filter((c) => c.resolvedTerm !== null).length} resolved
        </li>
      </ul>

      {summary.length === 0 ? (
        <div className="panel" style={{ padding: 16, marginTop: 12 }}>
          <p style={{ margin: 0 }}>
            No documents materialized into the graph yet — ingest one on the Documents page.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 18, marginTop: 12 }}>
          <GraphCanvas
            layout={layout}
            ariaLabel="Documents graph"
            colorFor={(label) => nodeColor[label] ?? "#94a3b8"}
            onSelectNode={(id) => setSelected(filtered.nodes.find((n) => n.id === id) ?? null)}
          />

          <div style={{ width: 320 }}>
            <section aria-label="Document mention summary" className="panel" style={{ marginBottom: 18, padding: 16 }}>
              <h2>Document mention summary</h2>
              {summary.map((row) => (
                <p key={row.document} style={{ margin: "6px 0" }}>
                  <b>{row.document}</b> — {row.mentions} mentions · {row.resolved} resolved
                </p>
              ))}
            </section>

            <section aria-label="Inspector" className="panel" style={{ padding: 16 }}>
              {selected === null ? (
                <p className="dim">Select a node to inspect it.</p>
              ) : (
                <>
                  <h2>{selected.name}</h2>
                  <p className="dim">{selected.label}</p>
                  {Object.entries(selected.properties).map(([key, value]) => (
                    <p key={key} style={{ margin: "4px 0" }}>
                      <b>{key}:</b> {String(value)}
                    </p>
                  ))}
                </>
              )}
            </section>
          </div>
        </div>
      )}

      <section aria-label="Mention chains" className="panel" style={{ marginTop: 18 }}>
        <div className="panel-h">
          <h2>Mention chains</h2>
          <span className="hint">document → mention text → term → related rules</span>
        </div>
        {chains.length === 0 ? (
          <p style={{ padding: 14, margin: 0 }} className="dim">
            No mentions materialized yet.
          </p>
        ) : (
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Mention text</th>
                  <th>Resolves to</th>
                  <th>Related rules</th>
                </tr>
              </thead>
              <tbody>
                {chains.map((row, index) => (
                  <tr key={index}>
                    <td className="dim">{row.document}</td>
                    <td className="mono" style={{ fontSize: 11 }}>
                      {row.mentionText}
                    </td>
                    <td>{row.resolvedTerm ?? "—"}</td>
                    <td className="dim">{row.relatedRules.join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
