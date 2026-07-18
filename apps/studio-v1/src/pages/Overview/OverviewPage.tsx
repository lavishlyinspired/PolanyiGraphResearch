import { useEffect, useState } from "react";
import { fetchSources, type Source } from "@/api/schema";
import { fetchContext, type SemanticContext } from "@/api/context";
import { fetchAlignmentQueue, GraphDBUnavailableError } from "@/api/ontology";
import { fetchGraphStats, fetchHealth, Neo4jUnavailableError, type Health } from "@/api/health";

type OntologyStat =
  | { kind: "unavailable" }
  | { kind: "ready"; aligned: number; review: number; total: number };

type GraphStat = { kind: "unavailable" } | { kind: "ready"; nodes: number; edges: number };

function serviceChip(configured: boolean, available: boolean): string {
  if (!configured) return "";
  return available ? "chip-good" : "chip-bad";
}

function serviceLabel(configured: boolean, available: boolean): string {
  if (!configured) return "not configured";
  return available ? "connected" : "unreachable";
}

export function OverviewPage() {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [context, setContext] = useState<SemanticContext | null>(null);
  const [ontologyStat, setOntologyStat] = useState<OntologyStat | null>(null);
  const [graphStat, setGraphStat] = useState<GraphStat | null>(null);
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetchSources()
      .then((s) => {
        if (!cancelled) setSources(s);
      })
      .catch(() => {
        // Pipeline tile just stays in its loading state without sources.
      });

    void fetchContext()
      .then((ctx) => {
        if (!cancelled) setContext(ctx);
      })
      .catch(() => {
        // Pipeline tile just stays in its loading state without context.
      });

    void fetchAlignmentQueue()
      .then((queue) => {
        if (cancelled) return;
        const aligned = queue.items.filter((item) => item.band === "auto").length;
        const review = queue.items.filter((item) => item.band === "review").length;
        setOntologyStat({ kind: "ready", aligned, review, total: queue.items.length });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof GraphDBUnavailableError) {
          setOntologyStat({ kind: "unavailable" });
        }
      });

    void fetchGraphStats()
      .then((stats) => {
        if (!cancelled) setGraphStat({ kind: "ready", nodes: stats.nodes, edges: stats.edges });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof Neo4jUnavailableError) {
          setGraphStat({ kind: "unavailable" });
        }
      });

    void fetchHealth()
      .then((h) => {
        if (!cancelled) setHealth(h);
      })
      .catch(() => {
        // Runtime health panel just stays in its loading state.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const connectedSources = sources?.filter((s) => s.status === "connected") ?? [];
  const totalTables = connectedSources.reduce((sum, s) => sum + s.table_count, 0);

  return (
    <main className="view">
      <div className="view-head">
        <div>
          <h1>Overview</h1>
          <p className="sub">
            {context === null
              ? "Loading semantic context…"
              : `Context · ${context.domain} · ${
                  context.generated_by === "llm" ? "LLM-enriched" : "deterministic engine"
                }`}
          </p>
        </div>
      </div>

      <div className="pipeline" role="list" aria-label="Runtime pipeline">
        <div className="stage" role="listitem">
          <div className="s-name">
            <span className={`dot ${sources !== null && connectedSources.length > 0 ? "on" : "off"}`} />
            Sources
          </div>
          <div className="s-stat">
            {sources === null
              ? "Loading…"
              : `${connectedSources.length} connected · ${totalTables} tables introspected`}
          </div>
        </div>
        <div className="stage" role="listitem">
          <div className="s-name">
            <span className={`dot ${context !== null ? "on" : "off"}`} />
            Semantic context
          </div>
          <div className="s-stat">
            {context === null
              ? "Loading…"
              : `${context.glossary.length} terms · ${context.relationships.length} relationships · ${context.business_rules.length} rules`}
          </div>
        </div>
        <div className="stage" role="listitem">
          <div className="s-name">
            <span className={`dot ${ontologyStat?.kind === "ready" ? "on" : "off"}`} />
            Ontology
          </div>
          <div className="s-stat">
            {ontologyStat === null
              ? "Loading…"
              : ontologyStat.kind === "unavailable"
                ? "GraphDB not configured"
                : `${ontologyStat.aligned} / ${ontologyStat.total} aligned to FIBO · ${ontologyStat.review} to review`}
          </div>
        </div>
        <div className="stage" role="listitem">
          <div className="s-name">
            <span className={`dot ${graphStat?.kind === "ready" ? "on" : "off"}`} />
            Knowledge graph
          </div>
          <div className="s-stat">
            {graphStat === null
              ? "Loading…"
              : graphStat.kind === "unavailable"
                ? "Neo4j not configured"
                : `${graphStat.nodes} nodes · ${graphStat.edges} relationships`}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">
          <h2>Runtime health</h2>
        </div>
        <div className="tblwrap">
          <table className="tbl">
            <tbody>
              <tr>
                <td>GraphDB</td>
                <td className="num">
                  {health === null ? (
                    <span className="dim">…</span>
                  ) : (
                    <span className={`chip ${serviceChip(health.graphdb.configured, health.graphdb.available)}`}>
                      {serviceLabel(health.graphdb.configured, health.graphdb.available)}
                    </span>
                  )}
                </td>
              </tr>
              <tr>
                <td>Neo4j</td>
                <td className="num">
                  {health === null ? (
                    <span className="dim">…</span>
                  ) : (
                    <span className={`chip ${serviceChip(health.neo4j.configured, health.neo4j.available)}`}>
                      {serviceLabel(health.neo4j.configured, health.neo4j.available)}
                    </span>
                  )}
                </td>
              </tr>
              <tr>
                <td>LLM</td>
                <td className="num">
                  {health === null ? (
                    <span className="dim">…</span>
                  ) : health.llm_mode === "llm" ? (
                    <span className="chip chip-good">key detected</span>
                  ) : (
                    <span className="chip">not configured</span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
