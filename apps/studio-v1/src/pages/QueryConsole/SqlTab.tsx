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
    <div>
      <label>
        SQL
        <textarea value={sql} onChange={(event) => setSql(event.target.value)} />
      </label>
      <button type="button" onClick={handleRun}>
        Run
      </button>
      {outcome !== null && (
        <>
          <div role="status">{bannerLabels[outcome.verdict]}</div>
          {outcome.verdict === "blocked" ? (
            <ul aria-label="Rule verdicts">
              {outcome.rows.map((row) => (
                <li key={row.ruleId}>
                  <span>{stampLabels[row.level]}</span> <span>{row.name}</span>
                  {row.message !== null && <p>{row.message}</p>}
                </li>
              ))}
            </ul>
          ) : outcome.data.length === 0 ? (
            <p>No rows matched this query.</p>
          ) : (
            <table>
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
          )}
        </>
      )}
    </div>
  );
}
