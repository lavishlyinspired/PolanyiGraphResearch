import { Fragment, useState } from "react";
import { GlossaryPage } from "@/pages/Glossary/GlossaryPage";
import { OntologyPage } from "@/pages/Ontology/OntologyPage";
import { QueryConsolePage } from "@/pages/QueryConsole/QueryConsolePage";
import { RulesPage } from "@/pages/Rules/RulesPage";
import { SourcesPage } from "@/pages/Sources/SourcesPage";
import { ValidatorPage } from "@/pages/Validator/ValidatorPage";

type PageId = "validator" | "console" | "glossary" | "rules" | "ontology" | "sources";

type NavItem = { id: PageId; label: string };
type NavGroup = { name: string; sub: string; items: NavItem[] };

// Groups and order match the prototype's sidebar exactly. Only groups/items
// backed by a built page are rendered — a nav entry leading nowhere is a lie.
const navGroups: NavGroup[] = [
  {
    name: "Ground",
    sub: "Connect sources",
    items: [{ id: "sources", label: "Data Sources" }],
  },
  {
    name: "Explore",
    sub: "Graph & Documents",
    items: [{ id: "console", label: "Query Console" }],
  },
  {
    name: "Govern",
    sub: "Rules & Compliance",
    items: [
      { id: "glossary", label: "Semantic Model" },
      { id: "rules", label: "Business Rules" },
      { id: "ontology", label: "Ontology · FIBO" },
      { id: "validator", label: "Validator" },
    ],
  },
];

export function AppShell() {
  const [page, setPage] = useState<PageId>("validator");

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="wordmark">
          <span className="mark" aria-hidden="true" />
          <b>Polanyi Works</b>
          <span>Studio</span>
        </div>
        <nav aria-label="Primary">
          {navGroups.map((group) => (
            <Fragment key={group.name}>
              <div className="nav-group">
                {group.name}
                <span className="sub">{group.sub}</span>
              </div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="nav-item"
                  aria-current={page === item.id ? "page" : undefined}
                  onClick={() => setPage(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </Fragment>
          ))}
        </nav>
      </aside>
      <div className="main">
        {page === "validator" && <ValidatorPage />}
        {page === "console" && <QueryConsolePage />}
        {page === "glossary" && <GlossaryPage />}
        {page === "rules" && <RulesPage />}
        {page === "ontology" && <OntologyPage />}
        {page === "sources" && <SourcesPage />}
      </div>
    </div>
  );
}
