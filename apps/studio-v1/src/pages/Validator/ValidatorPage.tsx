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

const bannerChip: Record<OverallVerdict, string> = {
  blocked: "chip-bad",
  "passed-with-warnings": "chip-warn",
  passed: "chip-good",
};

const stampLabels: Record<RuleLevel, string> = {
  blocked: "BLOCKED",
  warning: "WARNING",
  advisory: "ADVISORY",
  pass: "PASS",
};

const stampChip: Record<RuleLevel, string> = {
  blocked: "chip-bad",
  warning: "chip-warn",
  advisory: "",
  pass: "chip-good",
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
    <main className="view">
      <div className="view-head">
        <div>
          <h1>Validator</h1>
          <p className="sub">
            Checked against rules — this is not a proof of correctness; predicate-level
            SQL parsing is a known limitation.
          </p>
        </div>
        <div className="actions">
          <span className="chip chip-moss">
            <span className="g">⬢</span> symbolic · no LLM
          </span>
        </div>
      </div>

      <div className="seg" role="group" aria-label="Example queries" style={{ marginBottom: 14 }}>
        <button type="button" onClick={() => setSql(VIOLATING_SQL)}>
          Violating query
        </button>
        <button type="button" onClick={() => setSql(CORRECTED_SQL)}>
          Corrected query
        </button>
      </div>

      <div className={verdict === null && !error ? undefined : "cols cols-2"}>
        <div className="panel" style={{ marginBottom: 18, alignSelf: "start" }}>
          <div className="panel-h">
            <h2>SQL</h2>
            <div className="actions">
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={handleValidate}
                disabled={!canValidate}
              >
                Validate
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
                style={{ width: "100%", minHeight: 140, display: "block", marginTop: 6 }}
              />
            </label>
          </div>
        </div>

        <div>
          {error && (
            <div className="panel chip-bad" style={{ padding: 14, marginBottom: 18 }}>
              <p>Couldn&apos;t validate — the request failed.</p>
              <button type="button" className="btn btn-sm" onClick={handleValidate}>
                Retry
              </button>
            </div>
          )}

          {verdict !== null && (
            <div role="status" className={`chip ${bannerChip[verdict]}`} style={{ fontSize: 13, padding: "6px 14px", marginBottom: 14 }}>
              {bannerLabels[verdict]}
            </div>
          )}

          {rows !== null && (
            <div className="panel">
              <div className="panel-h">
                <h2>Rule ledger</h2>
              </div>
              <ul aria-label="Rule verdicts" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {rows.map((row) => (
                  <li
                    key={row.ruleId}
                    style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "9px 14px", borderBottom: "1px solid var(--line)" }}
                  >
                    <span className={`chip ${stampChip[row.level]}`}>{stampLabels[row.level]}</span>
                    <span>{row.name}</span>
                    {row.message !== null && <p className="dim" style={{ margin: 0 }}>{row.message}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <p className="dim">
        CLI equivalent: <code>polanyi validate &quot;SELECT …&quot;</code>
      </p>
    </main>
  );
}
