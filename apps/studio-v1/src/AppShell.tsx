import { Fragment, useState } from "react";
import { NavigationProvider, type PageId } from "@/navigation";
import { AgentPage } from "@/pages/Agent/AgentPage";
import { DocumentsPage } from "@/pages/Documents/DocumentsPage";
import { GlossaryPage } from "@/pages/Glossary/GlossaryPage";
import { OntologyPage } from "@/pages/Ontology/OntologyPage";
import { OverviewPage } from "@/pages/Overview/OverviewPage";
import { QueryConsolePage } from "@/pages/QueryConsole/QueryConsolePage";
import { RulesPage } from "@/pages/Rules/RulesPage";
import { SourcesPage } from "@/pages/Sources/SourcesPage";
import { ValidatorPage } from "@/pages/Validator/ValidatorPage";

type NavItem = { id: PageId; label: string };
type NavGroup = { name: string; sub: string; items: NavItem[] };

// Overview and Agent sit above the grouped nav, matching the prototype's
// ungrouped top-level items.
const topNavItems: NavItem[] = [
  { id: "overview", label: "Overview" },
  { id: "agent", label: "Agent Workspace" },
];

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
    items: [
      { id: "console", label: "Query Console" },
      { id: "documents", label: "Documents" },
    ],
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

// Rendering the active page's component and letting inactive ones unmount
// would discard their fetched data on every switch, forcing a refetch (and a
// "Loading…" flash) each time a tab is revisited. Instead each page mounts
// once, the first time it's visited, and then stays mounted — switching tabs
// only toggles which one is visible.
const pageComponents: Record<PageId, () => React.JSX.Element> = {
  overview: OverviewPage,
  agent: AgentPage,
  validator: ValidatorPage,
  console: QueryConsolePage,
  glossary: GlossaryPage,
  rules: RulesPage,
  ontology: OntologyPage,
  sources: SourcesPage,
  documents: DocumentsPage,
};

export function AppShell() {
  const [page, setPage] = useState<PageId>("overview");
  const [mounted, setMounted] = useState<PageId[]>(["overview"]);

  function navigate(id: PageId) {
    setPage(id);
    setMounted((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  return (
    <NavigationProvider value={{ navigate }}>
      <div className="app">
        <aside className="sidebar">
          <div className="wordmark">
            <span className="mark" aria-hidden="true" />
            <b>Polanyi Works</b>
            <span>Studio</span>
          </div>
          <nav aria-label="Primary">
            {topNavItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className="nav-item"
                aria-current={page === item.id ? "page" : undefined}
                onClick={() => navigate(item.id)}
              >
                {item.label}
              </button>
            ))}
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
                    onClick={() => navigate(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </Fragment>
            ))}
          </nav>
        </aside>
        <div className="main">
          {mounted.map((id) => {
            const Page = pageComponents[id];
            return (
              <div key={id} hidden={page !== id}>
                <Page />
              </div>
            );
          })}
        </div>
      </div>
    </NavigationProvider>
  );
}
