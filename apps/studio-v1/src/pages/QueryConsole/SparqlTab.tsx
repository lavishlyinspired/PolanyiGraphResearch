import { useState } from "react";
import { runSparql, type SparqlResult } from "@/api/validation";

const engineLabels: Record<SparqlResult["engine"], string> = {
  graphdb: "Engine: GraphDB",
  local: "Engine: local (pyoxigraph)",
};

export function SparqlTab() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SparqlResult | null>(null);

  async function handleRun() {
    setResult(await runSparql(query));
  }

  return (
    <div className={result === null ? undefined : "cols cols-2"}>
      <div className="panel" style={{ marginBottom: 18, alignSelf: "start" }}>
        <div className="panel-h">
          <h2>SPARQL</h2>
          <div className="actions">
            <button type="button" className="btn btn-sm btn-primary" onClick={handleRun}>
              Run
            </button>
          </div>
        </div>
        <div style={{ padding: 14 }}>
          <label>
            SPARQL
            <textarea
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="code"
              style={{ width: "100%", minHeight: 120, display: "block", marginTop: 6 }}
            />
          </label>
        </div>
      </div>
      {result !== null && (
        <div className="panel">
          <div className="panel-h">
            <span className="hint">{engineLabels[result.engine]}</span>
          </div>
          <ul aria-label="SPARQL results" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {result.rows.map((row, index) => (
              <li key={index} style={{ padding: "9px 14px", borderBottom: "1px solid var(--line)" }} className="mono">
                {Object.entries(row).map(([key, value]) => (
                  <span key={key}>
                    {key}: {String(value)}{" "}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
