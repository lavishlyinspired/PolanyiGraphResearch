import { useState } from "react";
import { fetchContext, type GlossaryEntry, type Rule, type SemanticContext } from "@/api/context";
import { governingRules } from "./governingRules";

function TermDrawer({ term, rules }: { term: GlossaryEntry; rules: Rule[] }) {
  return (
    <aside aria-label="Term detail">
      <h2>{term.term}</h2>
      <p>{term.definition}</p>
      {term.ontology_uri !== null && <p>{term.ontology_uri}</p>}
      <h3>Governing rules</h3>
      {rules.length === 0 ? (
        <p>No rules govern this term.</p>
      ) : (
        <ul>
          {rules.map((rule) => (
            <li key={rule.rule_id}>{rule.name}</li>
          ))}
        </ul>
      )}
    </aside>
  );
}

export function GlossaryPage() {
  const [context, setContext] = useState<SemanticContext | null>(null);
  const [selected, setSelected] = useState<GlossaryEntry | null>(null);

  if (context === null) {
    void fetchContext().then(setContext);
    return <p>Loading…</p>;
  }

  return (
    <div>
      <h1>Semantic Model</h1>
      <table>
        <thead>
          <tr>
            <th scope="col">Term</th>
            <th scope="col">Definition</th>
            <th scope="col">FIBO</th>
          </tr>
        </thead>
        <tbody>
          {context.glossary.map((entry) => (
            <tr key={entry.term}>
              <td>
                <button type="button" onClick={() => setSelected(entry)}>
                  {entry.term}
                </button>
              </td>
              <td>{entry.definition}</td>
              <td>{entry.ontology_class ?? "Not aligned"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected !== null && (
        <TermDrawer term={selected} rules={governingRules(selected, context.business_rules)} />
      )}
    </div>
  );
}
