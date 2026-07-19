import { useState } from "react";
import { RejectedCypherError, runCypher } from "@/api/validation";

interface Outcome {
  kind: "rows" | "rejected";
  rows: Record<string, unknown>[];
  rejectionMessage: string | null;
}

export function CypherTab() {
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function handleRun() {
    try {
      const result = await runCypher(query);
      setOutcome({ kind: "rows", rows: result.rows, rejectionMessage: null });
    } catch (error) {
      if (error instanceof RejectedCypherError) {
        setOutcome({ kind: "rejected", rows: [], rejectionMessage: error.message });
        return;
      }
      throw error;
    }
  }

  return (
    <div className={outcome === null ? undefined : "cols cols-2"}>
      <div className="panel" style={{ marginBottom: 18, alignSelf: "start" }}>
        <div className="panel-h">
          <h2>Cypher</h2>
          <div className="actions">
            <button type="button" className="btn btn-sm btn-primary" onClick={handleRun}>
              Run
            </button>
          </div>
        </div>
        <div style={{ padding: 14 }}>
          <label>
            Cypher
            <textarea
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="code"
              style={{ width: "100%", minHeight: 120, display: "block", marginTop: 6 }}
            />
          </label>
        </div>
      </div>
      {outcome?.kind === "rejected" && (
        <div className="panel" style={{ padding: 14 }}>
          <p style={{ margin: 0 }}>{outcome.rejectionMessage}</p>
        </div>
      )}
      {outcome?.kind === "rows" && (
        <div className="panel">
          <ul aria-label="Cypher results" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {outcome.rows.map((row, index) => (
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
