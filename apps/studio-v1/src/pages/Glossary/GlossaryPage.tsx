import { useEffect, useState } from "react";
import { fetchContext, type SemanticContext } from "@/api/context";
import { EntitiesRelationshipsTab } from "./EntitiesRelationshipsTab";
import { GlossaryTab } from "./GlossaryTab";

type TabId = "glossary" | "entities";

export function GlossaryPage() {
  const [context, setContext] = useState<SemanticContext | null>(null);
  const [active, setActive] = useState<TabId>("glossary");

  useEffect(() => {
    let cancelled = false;
    void fetchContext().then((ctx) => {
      if (!cancelled) setContext(ctx);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (context === null) {
    return <p>Loading…</p>;
  }

  return (
    <main className="view">
      <div className="view-head">
        <h1>Semantic Model</h1>
      </div>
      <div className="tabs" role="tablist" aria-label="Semantic model view">
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={active === "glossary"}
          onClick={() => setActive("glossary")}
        >
          Glossary · {context.glossary.length}
        </button>
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={active === "entities"}
          onClick={() => setActive("entities")}
        >
          Entities &amp; relationships · {context.key_entities.length} / {context.relationships.length}
        </button>
      </div>
      {/* Both panes stay mounted so switching tabs doesn't lose the term
          drawer's selection — only visibility toggles. */}
      <div className="tabpane" hidden={active !== "glossary"}>
        <GlossaryTab context={context} />
      </div>
      <div className="tabpane" hidden={active !== "entities"}>
        <EntitiesRelationshipsTab context={context} />
      </div>
    </main>
  );
}
