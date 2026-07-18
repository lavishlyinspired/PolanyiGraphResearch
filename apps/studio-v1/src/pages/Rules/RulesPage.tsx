import { useState } from "react";
import { fetchRules, type Rule } from "@/api/validation";

function severityChip(severity: string): string {
  if (severity === "CRITICAL" || severity === "HIGH") return "chip-bad";
  if (severity === "WARNING" || severity === "MEDIUM") return "chip-warn";
  return "";
}

function RuleDetail({ rule }: { rule: Rule }) {
  return (
    <aside aria-label="Rule detail" className="panel" style={{ padding: 16 }}>
      <h2>{rule.name}</h2>
      <p>{rule.description}</p>
      <h3>Affected tables</h3>
      <ul>
        {rule.affected_entities.map((entity) => (
          <li key={entity}>{entity}</li>
        ))}
      </ul>
    </aside>
  );
}

export function RulesPage() {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [selected, setSelected] = useState<Rule | null>(null);

  if (rules === null) {
    void fetchRules().then(setRules);
    return <p>Loading…</p>;
  }

  return (
    <main className="view">
      <div className="view-head">
        <h1>Business Rules</h1>
      </div>
      <div className={selected === null ? undefined : "cols cols-2"}>
        <div className="panel tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Rule</th>
                <th scope="col">Severity</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.rule_id}>
                  <td>
                    <button type="button" className="link-cell" onClick={() => setSelected(rule)}>
                      {rule.name}
                    </button>
                  </td>
                  <td>
                    <span className={`chip ${severityChip(rule.severity)}`}>{rule.severity}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selected !== null && <RuleDetail rule={selected} />}
      </div>
    </main>
  );
}
