import { useState } from "react";
import { executeSql, fetchRules } from "@/api/validation";
import {
  overallVerdict,
  ruleRows,
  type OverallVerdict,
  type RuleLevel,
  type RuleRow,
} from "@/pages/Validator/verdict";

const bannerLabels: Record<OverallVerdict, string> = {
  blocked: "BLOCKED",
  "passed-with-warnings": "PASSED WITH WARNINGS",
  passed: "PASSED",
};

const stampLabels: Record<RuleLevel, string> = {
  blocked: "BLOCKED",
  warning: "WARNING",
  advisory: "ADVISORY",
  pass: "PASS",
};

interface QueryOutcome {
  verdict: OverallVerdict;
  rows: RuleRow[];
  columns: string[];
  data: Record<string, unknown>[];
}

export function SqlTab() {
  const [sql, setSql] = useState("");
  const [outcome, setOutcome] = useState<QueryOutcome | null>(null);

  async function handleRun() {
    const [result, rules] = await Promise.all([executeSql(sql), fetchRules()]);
    setOutcome({
      verdict: overallVerdict(result.validation),
      rows: ruleRows(result.validation, rules),
      columns: result.columns,
      data: result.rows,
    });
  }

  return (
    <div className={outcome === null ? undefined : "cols cols-2"}>
      <div className="panel" style={{ marginBottom: 18, alignSelf: "start" }}>
        <div className="panel-h">
          <h2>SQL</h2>
          <div className="actions">
            <button type="button" className="btn btn-sm btn-primary" onClick={handleRun}>
              Run
            </button>
          </div>
        </div>
        <div style={{ padding: 14 }}>
          <label>
            SQL
            <textarea
              value={sql}
              onChange={(event) => setSql(event.target.value)}
              className="code"
              style={{ width: "100%", minHeight: 120, display: "block", marginTop: 6 }}
            />
          </label>
        </div>
      </div>
      {outcome !== null && (
        <div>
          <div role="status" className="chip" style={{ marginBottom: 12 }}>
            {bannerLabels[outcome.verdict]}
          </div>
          {outcome.verdict === "blocked" ? (
            <div className="panel">
              <ul aria-label="Rule verdicts" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {outcome.rows.map((row) => (
                  <li
                    key={row.ruleId}
                    style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "9px 14px", borderBottom: "1px solid var(--line)" }}
                  >
                    <span className="chip">{stampLabels[row.level]}</span>
                    <span>{row.name}</span>
                    {row.message !== null && <p className="dim" style={{ margin: 0 }}>{row.message}</p>}
                  </li>
                ))}
              </ul>
            </div>
          ) : outcome.data.length === 0 ? (
            <p className="dim">No rows matched this query.</p>
          ) : (
            <div className="panel tblwrap">
              <table className="tbl">
                <thead>
                  <tr>
                    {outcome.columns.map((column) => (
                      <th key={column} scope="col">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {outcome.data.map((row, index) => (
                    <tr key={index}>
                      {outcome.columns.map((column) => (
                        <td key={column}>{String(row[column])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
