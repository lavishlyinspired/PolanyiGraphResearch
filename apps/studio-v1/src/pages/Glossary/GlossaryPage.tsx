import { useState } from "react";
import { fetchContext, type GlossaryEntry, type Rule, type SemanticContext } from "@/api/context";
import { governingRules } from "./governingRules";

function TermDrawer({ term, rules }: { term: GlossaryEntry; rules: Rule[] }) {
  return (
    <aside aria-label="Term detail" className="panel" style={{ padding: 16 }}>
      <h2>{term.term}</h2>
      <p>{term.definition}</p>
      {term.ontology_uri !== null && (
        <p className="mono dim">{term.ontology_uri}</p>
      )}
      <h3>Governing rules</h3>
      {rules.length === 0 ? (
        <p className="dim">No rules govern this term.</p>
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
    <main className="view">
      <div className="view-head">
        <h1>Semantic Model</h1>
      </div>
      <div className={selected === null ? undefined : "cols cols-2"}>
        <div className="panel tblwrap">
          <table className="tbl">
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
                    <button type="button" className="link-cell" onClick={() => setSelected(entry)}>
                      {entry.term}
                    </button>
                  </td>
                  <td>{entry.definition}</td>
                  <td>
                    {entry.ontology_class === null ? (
                      <span className="dim">Not aligned</span>
                    ) : (
                      <span className="chip chip-moss">{entry.ontology_class}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selected !== null && (
          <TermDrawer term={selected} rules={governingRules(selected, context.business_rules)} />
        )}
      </div>
    </main>
  );
}
