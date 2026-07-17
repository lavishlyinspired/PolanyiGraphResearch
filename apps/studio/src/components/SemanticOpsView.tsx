import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getCapabilities,
  ingestDocumentText,
  reasonOntology,
  searchOntology,
  type ApiCapability,
  type ApiMention,
  type ApiOntologyCandidate,
  type ApiReasoning,
} from "@/lib/api";
import { FileText, Network, Puzzle, Search, Sparkles } from "lucide-react";

const typeColors: Record<string, string> = {
  Organization: "bg-teal-100 text-teal-800",
  FinancialInstrument: "bg-violet-100 text-violet-800",
  Metric: "bg-emerald-100 text-emerald-800",
  MonetaryAmount: "bg-amber-100 text-amber-800",
  Date: "bg-sky-100 text-sky-800",
  Currency: "bg-cyan-100 text-cyan-800",
  Regulation: "bg-rose-100 text-rose-800",
  Person: "bg-indigo-100 text-indigo-800",
  Other: "bg-slate-100 text-slate-700",
};

const SAMPLE_TEXT =
  "Goldman Sachs Group Inc executed trades worth $98,500,000 on 2026-01-17. " +
  "The desk's VaR remained within the notional amount limits; all settlement " +
  "dates complied with the T+1 requirement.";

function DocumentIngestPanel() {
  const [text, setText] = useState(SAMPLE_TEXT);
  const [busy, setBusy] = useState(false);
  const [mentions, setMentions] = useState<ApiMention[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    const result = await ingestDocumentText(text, "Studio ingestion");
    setBusy(false);
    if (!result) {
      setError("Ingestion failed — is the GraphOS API running?");
      return;
    }
    setMentions(result.mentions);
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="font-serif text-lg text-slate-800 flex items-center gap-2">
          <FileText className="w-4 h-4 text-teal-600" />
          Document Ingestion
        </CardTitle>
        <p className="text-sm text-slate-500">
          Paste text → extract mentions → resolve against the business glossary.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          className="w-full rounded-lg border border-slate-200 p-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        <Button
          onClick={() => void run()}
          disabled={busy}
          className="bg-teal-600 hover:bg-teal-700 text-white"
        >
          <Sparkles className="w-4 h-4 mr-1" />
          {busy ? "Extracting…" : "Extract & Resolve"}
        </Button>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {mentions && (
          <div className="space-y-2 pt-2">
            <p className="text-xs text-slate-400 uppercase tracking-wide">
              {mentions.length} mentions
            </p>
            <div className="flex flex-wrap gap-2">
              {mentions.map((m, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                    typeColors[m.entity_type] ?? typeColors.Other
                  }`}
                  title={m.context}
                >
                  {m.text}
                  <span className="opacity-60">· {m.entity_type}</span>
                  {m.resolved_term && (
                    <span className="bg-white/70 text-emerald-700 rounded-full px-1.5">
                      → {m.resolved_term}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OntologyExplorerPanel() {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<ApiOntologyCandidate[] | null>(null);
  const [reasoning, setReasoning] = useState<ApiReasoning | null>(null);

  const search = async () => {
    if (!query.trim() || busy) return;
    setBusy(true);
    setReasoning(null);
    setCandidates(await searchOntology(query));
    setBusy(false);
  };

  const reason = async (uri: string) => {
    setBusy(true);
    setReasoning(await reasonOntology(uri));
    setBusy(false);
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="font-serif text-lg text-slate-800 flex items-center gap-2">
          <Network className="w-4 h-4 text-teal-600" />
          Ontology Explorer (FIBO)
        </CardTitle>
        <p className="text-sm text-slate-500">
          Search classes in GraphDB, then reason about their hierarchy.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void search()}
            placeholder="e.g. corporate bond, counterparty, settlement date"
            className="flex-1"
          />
          <Button
            onClick={() => void search()}
            disabled={busy}
            className="bg-teal-600 hover:bg-teal-700 text-white"
          >
            <Search className="w-4 h-4" />
          </Button>
        </div>
        {candidates && candidates.length === 0 && (
          <p className="text-sm text-slate-400">No classes found (is GraphDB running?)</p>
        )}
        {candidates?.map((c) => (
          <button
            key={c.uri}
            onClick={() => void reason(c.uri)}
            className="w-full text-left rounded-lg border border-slate-200 px-3 py-2 hover:border-teal-400 hover:bg-teal-50/50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-800">{c.label}</span>
              <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                {(c.score * 100).toFixed(0)}%
              </Badge>
            </div>
            {c.definition && (
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{c.definition}</p>
            )}
          </button>
        ))}
        {reasoning && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-2">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Hierarchy</p>
            <p className="text-sm text-slate-700">
              {reasoning.ancestors.length > 0
                ? reasoning.ancestors.map((a) => a.label).join(" → ")
                : "(top-level class)"}
            </p>
            <p className="text-xs text-slate-500">
              {reasoning.descendants.length > 0 ? (
                <>
                  {reasoning.descendants.length} subclasses
                  {" — e.g. "}
                  {reasoning.descendants
                    .slice(0, 4)
                    .map((d) => d.label)
                    .join(", ")}
                </>
              ) : (
                <span className="text-amber-600">
                  0 subclasses — this is a leaf class. Try a higher-level class from the search results for a richer hierarchy.
                </span>
              )}
            </p>
            <p className="text-xs text-slate-400">{reasoning.reasoner.detail}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CapabilitiesPanel() {
  const [capabilities, setCapabilities] = useState<ApiCapability[] | null>(null);

  useEffect(() => {
    void getCapabilities().then(setCapabilities);
  }, []);

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="font-serif text-lg text-slate-800 flex items-center gap-2">
          <Puzzle className="w-4 h-4 text-teal-600" />
          Capability Registry
        </CardTitle>
        <p className="text-sm text-slate-500">
          Agents request capabilities; the registry resolves providers.
        </p>
      </CardHeader>
      <CardContent>
        {!capabilities && (
          <p className="text-sm text-slate-400">API offline — no live catalog.</p>
        )}
        <div className="space-y-2">
          {capabilities?.map((c) => (
            <div
              key={`${c.capability}-${c.name}`}
              className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
            >
              <div>
                <span className="text-sm font-medium text-slate-800">{c.capability}</span>
                <p className="text-xs text-slate-500">{c.description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <Badge variant="secondary" className="bg-teal-50 text-teal-700 border border-teal-200">
                  {c.kind}
                </Badge>
                <span className="text-xs text-slate-400 font-mono">{c.name}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function SemanticOpsView() {
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="font-serif text-3xl font-bold text-slate-900 mb-1">Semantic Ops</h2>
        <p className="text-slate-500">
          Live semantic runtime operations: ingest documents, explore the ontology,
          inspect the capability catalog.
        </p>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-6">
          <DocumentIngestPanel />
          <OntologyExplorerPanel />
        </div>
        <CapabilitiesPanel />
      </div>
    </div>
  );
}
