import { useState } from "react";
import { fetchRules, type Rule } from "@/api/validation";

function RuleDetail({ rule }: { rule: Rule }) {
  return (
    <aside aria-label="Rule detail">
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
    <div>
      <h1>Business Rules</h1>
      <table>
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
                <button type="button" onClick={() => setSelected(rule)}>
                  {rule.name}
                </button>
              </td>
              <td>{rule.severity}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected !== null && <RuleDetail rule={selected} />}
    </div>
  );
}
