import { useEffect, useState } from "react";
import { fetchComplianceSummary, fetchComplianceEvents, type ComplianceSummary, type EnforcementEvent } from "@/api/compliance";
import { fetchRules, type Rule } from "@/api/validation";
import { buildLayout } from "./graphLayout";
import { GraphCanvas } from "./GraphCanvas";
import { buildComplianceRows, buildRulesGraph, type RuleComplianceRow } from "./complianceGraph";

type State =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; rules: Rule[]; summary: ComplianceSummary; events: EnforcementEvent[] };

const nodeColor: Record<string, string> = {
  Rule: "#dc2626",
  Entity: "#0891b2",
};

function verdictLabel(verdict: EnforcementEvent["verdict"]): string {
  if (verdict === "blocked") return "✕ blocked";
  if (verdict === "flagged") return "⚠ flagged";
  return "✓ passed";
}

function formatSql(sql: string): string {
  const oneLine = sql.replace(/\s+/g, " ").trim();
  return oneLine.length > 60 ? `${oneLine.slice(0, 60)}…` : oneLine;
}

export function CompliancePerspective() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [selected, setSelected] = useState<RuleComplianceRow | null>(null);

  useEffect(() => {
    void Promise.all([fetchRules(), fetchComplianceSummary(), fetchComplianceEvents()])
      .then(([rules, summary, events]) => setState({ kind: "ready", rules, summary, events }))
      .catch(() => setState({ kind: "error" }));
  }, []);

  if (state.kind === "loading") {
    return <p>Loading…</p>;
  }

  if (state.kind === "error") {
    return (
      <div className="panel" style={{ padding: 16 }}>
        <p style={{ margin: 0 }}>Couldn&apos;t load compliance data.</p>
      </div>
    );
  }

  const rows = buildComplianceRows(state.rules, state.summary.rules);
  const graph = buildRulesGraph(state.rules);
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
        <li style={{ marginLeft: "auto", color: "var(--ink-3)" }}>
          {state.rules.length} rules · {state.summary.total_events} enforcements ({state.summary.window_days}d)
        </li>
      </ul>

      <div style={{ display: "flex", gap: 18, marginTop: 12 }}>
        <GraphCanvas
          layout={layout}
          ariaLabel="Compliance graph"
          colorFor={(label) => nodeColor[label] ?? "#94a3b8"}
          onSelectNode={(id) => {
            const node = graph.nodes.find((n) => n.id === id);
            const row = node !== undefined ? (rows.find((r) => r.ruleId === node.name) ?? null) : null;
            setSelected(row);
          }}
        />

        <div style={{ width: 320 }}>
          <section aria-label="Enforcement summary" className="panel" style={{ marginBottom: 18, padding: 16 }}>
            <h2>Enforcement summary</h2>
            <p className="dim" style={{ fontSize: 12 }}>
              last {state.summary.window_days} days
            </p>
            {rows.length === 0 ? (
              <p className="dim">No business rules declared.</p>
            ) : (
              rows.map((row) => (
                <p key={row.ruleId} style={{ margin: "6px 0" }}>
                  <b>{row.ruleId}</b> — {row.passed} passed / {row.flagged} flagged / {row.blocked} blocked
                </p>
              ))
            )}
          </section>

          <section aria-label="Inspector" className="panel" style={{ padding: 16 }}>
            {selected === null ? (
              <p className="dim">Select a node to inspect it.</p>
            ) : (
              <>
                <h2>{selected.ruleId}</h2>
                <p className="dim">{selected.ruleName}</p>
                <p style={{ margin: "4px 0" }}>
                  <b>Severity:</b> {selected.severity}
                </p>
                <p style={{ margin: "4px 0" }}>
                  <b>Applies to:</b> {selected.affectedEntities.join(", ") || "—"}
                </p>
                <p style={{ margin: "4px 0" }}>
                  <b>Passed:</b> {selected.passed} · <b>Flagged:</b> {selected.flagged} · <b>Blocked:</b> {selected.blocked}
                </p>
              </>
            )}
          </section>
        </div>
      </div>

      <section aria-label="Recent enforcement events" className="panel" style={{ marginTop: 18 }}>
        <div className="panel-h">
          <h2>Recent enforcement events</h2>
        </div>
        {state.events.length === 0 ? (
          <p style={{ padding: 14, margin: 0 }} className="dim">
            No queries have been validated yet — run a query in the Query Console or ask the agent a question.
          </p>
        ) : (
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Rule</th>
                  <th>Query fragment</th>
                  <th>Source</th>
                  <th>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {state.events.map((event, index) => (
                  <tr key={index}>
                    <td className="dim">{new Date(event.timestamp).toLocaleTimeString()}</td>
                    <td>{event.rule_id}</td>
                    <td className="mono" style={{ fontSize: 11 }}>
                      {formatSql(event.sql)}
                    </td>
                    <td className="dim">{event.source}</td>
                    <td>{verdictLabel(event.verdict)}</td>
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
