import { useEffect, useState } from "react";
import { fetchSchema, type SchemaSnapshot } from "@/api/schema";
import { fetchContext, type SemanticContext } from "@/api/context";
import { fetchAlignmentQueue, GraphDBUnavailableError, type AlignmentQueue } from "@/api/ontology";
import { fetchRules, type Rule } from "@/api/validation";
import { fetchSessions, type SessionSummary } from "@/api/agent";
import { fetchComplianceEvents, type EnforcementEvent } from "@/api/compliance";
import { buildPipelineStages, traceFromEvent } from "./lineagePipeline";

type State =
  | { kind: "loading" }
  | { kind: "error" }
  | {
      kind: "ready";
      schema: SchemaSnapshot;
      context: SemanticContext;
      alignment: AlignmentQueue | null;
      rules: Rule[];
      sessions: SessionSummary[];
      agentEvents: EnforcementEvent[];
    };

const GUIDED_WALK_STEPS = [
  "Schema introspection — tables and foreign keys extracted from the connected database",
  "Entity derivation — deterministic: tables become entities, foreign keys become relationships",
  "Glossary mapping — business terms tied to their real source tables/columns",
  "FIBO alignment — glossary terms matched to ontology classes, reviewed by a steward",
  "Rule enforcement — business rules attached to the entities and terms they govern",
  "Agent grounding — the semantic context is injected into the agent; every answer traces back through this pipeline",
];

export function LineagePerspective() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [selectedEventIndex, setSelectedEventIndex] = useState<number | null>(null);

  useEffect(() => {
    void Promise.all([
      fetchSchema(),
      fetchContext(),
      fetchAlignmentQueue().catch((error) => {
        if (error instanceof GraphDBUnavailableError) return null;
        throw error;
      }),
      fetchRules(),
      fetchSessions(),
      fetchComplianceEvents(50),
    ])
      .then(([schema, context, alignment, rules, sessions, events]) =>
        setState({
          kind: "ready",
          schema,
          context,
          alignment,
          rules,
          sessions,
          agentEvents: events.filter((e) => e.source === "agent"),
        }),
      )
      .catch(() => setState({ kind: "error" }));
  }, []);

  if (state.kind === "loading") {
    return <p>Loading…</p>;
  }

  if (state.kind === "error") {
    return (
      <div className="panel" style={{ padding: 16 }}>
        <p style={{ margin: 0 }}>Couldn&apos;t load lineage data.</p>
      </div>
    );
  }

  const stages = buildPipelineStages({
    schema: state.schema,
    context: state.context,
    alignment: state.alignment,
    rules: state.rules,
    sessions: state.sessions,
  });
  const selectedEvent = selectedEventIndex === null ? null : state.agentEvents[selectedEventIndex];
  const trace = selectedEvent === undefined || selectedEvent === null ? null : traceFromEvent(selectedEvent, state.context, state.rules);

  return (
    <div>
      <section aria-label="Knowledge lineage pipeline" className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-h">
          <h2>Knowledge lineage pipeline</h2>
          <span className="hint">schema → entities → terms → FIBO → rules → agent</span>
        </div>
        <div style={{ display: "flex", gap: 8, padding: 16, flexWrap: "wrap" }}>
          {stages.map((stage) => (
            <div key={stage.title} className="panel" style={{ padding: 12, minWidth: 130 }}>
              <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase" }}>{stage.title}</div>
              <div style={{ fontWeight: 600 }}>{stage.value}</div>
              <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{stage.sub}</div>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Lineage checkpoints" className="panel" style={{ marginBottom: 18, padding: 16 }}>
        <h2>Lineage checkpoints</h2>
        <p className="dim" style={{ margin: 0 }}>
          Not available yet — the semantic context has no version history (each generate/align overwrites the
          previous one). Tracked as a follow-up story rather than shown with fabricated checkpoints.
        </p>
      </section>

      <section aria-label="Trace a fact's lineage" className="panel">
        <div className="panel-h">
          <h2>Trace a fact&apos;s lineage</h2>
        </div>
        <div style={{ padding: 16 }}>
          {state.agentEvents.length === 0 ? (
            <p className="dim" style={{ margin: 0 }}>
              Ask the agent a question that runs a query, then trace it here.
            </p>
          ) : (
            <>
              <label htmlFor="lineage-event-select">Real agent query</label>
              <select
                id="lineage-event-select"
                value={selectedEventIndex ?? ""}
                onChange={(e) => setSelectedEventIndex(e.target.value === "" ? null : Number(e.target.value))}
                style={{ display: "block", marginBottom: 12 }}
              >
                <option value="">Select a query the agent ran…</option>
                {state.agentEvents.map((event, index) => (
                  <option key={index} value={index}>
                    {new Date(event.timestamp).toLocaleTimeString()} — {event.sql.slice(0, 60)}
                  </option>
                ))}
              </select>

              {trace !== null && (
                <div>
                  <p className="mono" style={{ fontSize: 11, whiteSpace: "pre-wrap" }}>
                    {trace.sql}
                  </p>
                  <p style={{ margin: "6px 0" }}>
                    <b>Tables:</b> {trace.tables.join(", ") || "—"}
                  </p>
                  <p style={{ margin: "6px 0" }}>
                    <b>Glossary terms:</b> {trace.terms.join(", ") || "—"}
                  </p>
                  <p style={{ margin: "6px 0" }}>
                    <b>Related rules:</b> {trace.relatedRules.join(", ") || "—"}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <section aria-label="How the graph was built" className="panel" style={{ marginTop: 18 }}>
        <div className="panel-h">
          <h2>How the graph was built</h2>
          <span className="hint">guided walk · 6 steps</span>
        </div>
        <ol style={{ padding: 16, margin: 0 }}>
          {GUIDED_WALK_STEPS.map((step, index) => (
            <li key={index} style={{ marginBottom: 8 }}>
              {step}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
