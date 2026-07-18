import { useState } from "react";
import { GlossaryPage } from "@/pages/Glossary/GlossaryPage";
import { QueryConsolePage } from "@/pages/QueryConsole/QueryConsolePage";
import { RulesPage } from "@/pages/Rules/RulesPage";
import { SourcesPage } from "@/pages/Sources/SourcesPage";
import { ValidatorPage } from "@/pages/Validator/ValidatorPage";

type PageId = "validator" | "console" | "glossary" | "rules" | "sources";

const pages: { id: PageId; label: string }[] = [
  { id: "validator", label: "Validator" },
  { id: "console", label: "Query Console" },
  { id: "glossary", label: "Semantic Model" },
  { id: "rules", label: "Business Rules" },
  { id: "sources", label: "Data Sources" },
];

export function AppShell() {
  const [page, setPage] = useState<PageId>("validator");

  return (
    <div>
      <nav aria-label="Primary">
        {pages.map((entry) => (
          <a
            key={entry.id}
            href={`#${entry.id}`}
            aria-current={page === entry.id ? "page" : undefined}
            onClick={(event) => {
              event.preventDefault();
              setPage(entry.id);
            }}
          >
            {entry.label}
          </a>
        ))}
      </nav>
      {page === "validator" && <ValidatorPage />}
      {page === "console" && <QueryConsolePage />}
      {page === "glossary" && <GlossaryPage />}
      {page === "rules" && <RulesPage />}
      {page === "sources" && <SourcesPage />}
    </div>
  );
}
