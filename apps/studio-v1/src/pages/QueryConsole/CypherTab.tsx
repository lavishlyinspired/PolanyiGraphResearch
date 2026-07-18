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
    <div>
      <label>
        Cypher
        <textarea value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <button type="button" onClick={handleRun}>
        Run
      </button>
      {outcome?.kind === "rejected" && <p>{outcome.rejectionMessage}</p>}
      {outcome?.kind === "rows" && (
        <ul aria-label="Cypher results">
          {outcome.rows.map((row, index) => (
            <li key={index}>
              {Object.entries(row).map(([key, value]) => (
                <span key={key}>
                  {key}: {String(value)}{" "}
                </span>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
