import { useEffect, useState } from "react";
import { fetchOntologyHierarchy, GraphDBUnavailableError, type OntologyHierarchy } from "@/api/ontology";

type State =
  | { kind: "loading" }
  | { kind: "ready"; hierarchy: OntologyHierarchy }
  | { kind: "unavailable" }
  | { kind: "error" };

type HierarchyPanelProps = { uri: string };

function reasonerSummary(reasoner: OntologyHierarchy["reasoner"]): string {
  if (!reasoner.ran) return reasoner.detail;
  return reasoner.consistent === true ? "Consistent (HermiT)" : "Inconsistent (HermiT)";
}

export function HierarchyPanel({ uri }: HierarchyPanelProps) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    void fetchOntologyHierarchy(uri)
      .then((hierarchy) => {
        if (!cancelled) setState({ kind: "ready", hierarchy });
      })
      .catch((error) => {
        if (cancelled) return;
        setState(error instanceof GraphDBUnavailableError ? { kind: "unavailable" } : { kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  if (state.kind === "loading") {
    return <p className="mt-2 text-xs text-slate-400">Loading hierarchy…</p>;
  }
  if (state.kind === "unavailable") {
    return (
      <p className="mt-2 text-xs text-slate-400">
        This requires GraphDB. Start it (<code>make up</code>) and reload.
      </p>
    );
  }
  if (state.kind === "error") {
    return <p className="mt-2 text-xs text-slate-400">Couldn&apos;t load the class hierarchy.</p>;
  }

  const { hierarchy } = state;
  return (
    <div className="mt-2 space-y-1 rounded-md bg-slate-50 p-2 text-xs">
      <div>
        <span className="font-semibold text-slate-600">Ancestors: </span>
        <span className="text-slate-700">
          {hierarchy.ancestors.length === 0
            ? "none (top-level class)"
            : hierarchy.ancestors.map((a) => a.label).join(" → ")}
        </span>
      </div>
      <div>
        <span className="font-semibold text-slate-600">
          Descendants ({hierarchy.descendants.length}):{" "}
        </span>
        <span className="text-slate-700">
          {hierarchy.descendants.length === 0
            ? "none (leaf class)"
            : hierarchy.descendants.map((d) => d.label).join(", ")}
        </span>
      </div>
      <div>
        <span className="font-semibold text-slate-600">Consistency: </span>
        <span className="text-slate-700">{reasonerSummary(hierarchy.reasoner)}</span>
      </div>
    </div>
  );
}
