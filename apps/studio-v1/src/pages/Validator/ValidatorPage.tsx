import { useState } from "react";
import { fetchRules, validateSql } from "@/api/validation";
import {
  overallVerdict,
  ruleRows,
  type OverallVerdict,
  type RuleLevel,
  type RuleRow,
} from "./verdict";

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

export const VIOLATING_SQL = `SELECT c.name, SUM(t.notional_amount) AS exposure
FROM trades t
JOIN counterparties c
  ON t.counterparty_id = c.counterparty_id
WHERE c.country_risk_rating >= 8
GROUP BY c.name
ORDER BY exposure DESC`;

export const CORRECTED_SQL = `SELECT c.name, SUM(t.notional_amount * fx.rate_to_usd) AS exposure_usd
FROM trades t
JOIN counterparties c
  ON t.counterparty_id = c.counterparty_id
 AND c.is_sanctioned = FALSE
JOIN fx_rates fx
  ON fx.currency = t.currency AND fx.rate_date = t.trade_date
WHERE c.country_risk_rating >= 8
GROUP BY c.name
ORDER BY exposure_usd DESC`;

export function ValidatorPage() {
  const [sql, setSql] = useState("");
  const [verdict, setVerdict] = useState<OverallVerdict | null>(null);
  const [rows, setRows] = useState<RuleRow[] | null>(null);
  const [error, setError] = useState(false);

  async function handleValidate() {
    setError(false);
    try {
      const [result, rules] = await Promise.all([validateSql(sql), fetchRules()]);
      setVerdict(overallVerdict(result));
      setRows(ruleRows(result, rules));
    } catch {
      setVerdict(null);
      setRows(null);
      setError(true);
    }
  }

  const canValidate = sql.trim().length > 0;

  return (
    <main>
      <h1>Validator</h1>
      <p>
        Checked against rules — this is not a proof of correctness; predicate-level
        SQL parsing is a known limitation.
      </p>
      <div>
        <button type="button" onClick={() => setSql(VIOLATING_SQL)}>
          Violating query
        </button>
        <button type="button" onClick={() => setSql(CORRECTED_SQL)}>
          Corrected query
        </button>
      </div>
      <label>
        SQL
        <textarea value={sql} onChange={(event) => setSql(event.target.value)} />
      </label>
      <button type="button" onClick={handleValidate} disabled={!canValidate}>
        Validate
      </button>
      <p>
        CLI equivalent: <code>polanyi validate &quot;SELECT …&quot;</code>
      </p>
      {error && (
        <div>
          <p>Couldn&apos;t validate — the request failed.</p>
          <button type="button" onClick={handleValidate}>
            Retry
          </button>
        </div>
      )}
      {verdict !== null && <div role="status">{bannerLabels[verdict]}</div>}
      {rows !== null && (
        <ul aria-label="Rule verdicts">
          {rows.map((row) => (
            <li key={row.ruleId}>
              <span>{stampLabels[row.level]}</span> <span>{row.name}</span>
              {row.message !== null && <p>{row.message}</p>}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
