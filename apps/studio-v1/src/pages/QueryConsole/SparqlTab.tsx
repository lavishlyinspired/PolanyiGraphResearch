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
    <div>
      <label>
        SPARQL
        <textarea value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <button type="button" onClick={handleRun}>
        Run
      </button>
      {result !== null && (
        <>
          <p>{engineLabels[result.engine]}</p>
          <ul aria-label="SPARQL results">
            {result.rows.map((row, index) => (
              <li key={index}>
                {Object.entries(row).map(([key, value]) => (
                  <span key={key}>
                    {key}: {String(value)}{" "}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
