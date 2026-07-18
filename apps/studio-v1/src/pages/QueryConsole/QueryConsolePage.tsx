import { useState } from "react";
import { CypherTab } from "./CypherTab";
import { SparqlTab } from "./SparqlTab";
import { SqlTab } from "./SqlTab";

type TabId = "sql" | "cypher" | "sparql";

const tabs: { id: TabId; label: string }[] = [
  { id: "sql", label: "SQL" },
  { id: "cypher", label: "Cypher" },
  { id: "sparql", label: "SPARQL" },
];

export function QueryConsolePage() {
  const [active, setActive] = useState<TabId>("sql");

  return (
    <main className="view">
      <div className="view-head">
        <h1>Query Console</h1>
      </div>
      <div className="tabs" role="tablist" aria-label="Query language">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={active === tab.id}
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {/* Each pane stays mounted so a tab's query/results survive switching
          away and back — only visibility toggles, matching the prototype. */}
      <div className="tabpane" hidden={active !== "sql"}>
        <SqlTab />
      </div>
      <div className="tabpane" hidden={active !== "cypher"}>
        <CypherTab />
      </div>
      <div className="tabpane" hidden={active !== "sparql"}>
        <SparqlTab />
      </div>
    </main>
  );
}
