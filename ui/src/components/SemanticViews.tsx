import { useState, useRef, useCallback } from "react";
import {
  ontologyConcepts,
  semanticConcepts,
  graphNodes,
  graphEdges,
  type OntologyConcept,
  type SemanticConcept,
  type GraphNode,
} from "@/data/mockData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  BookOpen,
  CircleDot,
  Database,
  Network,
  ShieldCheck,
  FileText,
  Code2,
  Layers,
  Move,
  ArrowRight,
  Building2,
  Boxes,
  Link2,
  Table2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sparkles,
  History,
  GitBranch,
  Gauge,
  Search,
  ChevronRight,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════
// Semantic View — GraphDB Ontology Browser
// ═══════════════════════════════════════════════════

function OntologyTree({
  concepts,
  selectedId,
  onSelect,
}: {
  concepts: OntologyConcept[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2 px-2 py-1.5 text-sm font-semibold text-teal-700">
        <BookOpen className="w-4 h-4" />
        FIBO Ontology
      </div>
      {concepts.map((concept) => (
        <button
          key={concept.id}
          onClick={() => onSelect(concept.id)}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left ml-2",
            selectedId === concept.id
              ? "bg-teal-50 text-teal-800 font-medium ring-1 ring-teal-200"
              : "hover:bg-slate-50 text-slate-600"
          )}
        >
          <CircleDot className="w-3 h-3 text-slate-400 shrink-0" />
          {concept.name}
        </button>
      ))}
    </div>
  );
}

function ConceptDetail({ concept }: { concept: OntologyConcept }) {
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h3 className="font-serif text-2xl font-bold text-slate-900">
            {concept.name}
          </h3>
          <code className="text-sm text-teal-600 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-100">
            {concept.fiboClass}
          </code>
        </div>
        <p className="text-slate-600 leading-relaxed">{concept.definition}</p>
      </div>

      <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 border border-slate-100">
        <span className="text-sm font-medium text-slate-500">Parent class:</span>
        <code className="text-sm text-teal-700 font-mono">{concept.parentClass}</code>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2">
          <Layers className="w-4 h-4 text-teal-600" />
          Properties
        </h4>
        <div className="space-y-1.5">
          {concept.properties.map((prop) => (
            <div
              key={prop.name}
              className="flex items-center gap-3 p-2.5 rounded-lg bg-white border border-slate-200"
            >
              <code className="text-sm font-mono font-medium text-slate-800 w-44 shrink-0">
                {prop.name}
              </code>
              <Badge variant="outline" className="text-xs text-slate-500 border-slate-200">
                {prop.type}
              </Badge>
              <code className="text-xs text-teal-600 font-mono ml-auto">
                {prop.fiboProp}
              </code>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-amber-600" />
          SHACL Constraints
        </h4>
        <div className="space-y-1.5">
          {concept.shaclConstraints.map((constraint, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50/50 border border-amber-100"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <code className="text-xs text-amber-900 font-mono">{constraint}</code>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">
          Related Concepts
        </h4>
        <div className="flex flex-wrap gap-2">
          {concept.relatedConcepts.map((rel) => (
            <Badge
              key={rel}
              variant="secondary"
              className="bg-teal-50 text-teal-700 border border-teal-200"
            >
              {rel}
            </Badge>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2">
          <Database className="w-4 h-4 text-teal-600" />
          Mapped Enterprise Tables
        </h4>
        <div className="space-y-1.5">
          {concept.mappedTables.map((table) => (
            <div
              key={table}
              className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100"
            >
              <Table2 className="w-3.5 h-3.5 text-slate-400" />
              <code className="text-sm font-mono text-slate-700">{table}</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SemanticView() {
  const [selectedId, setSelectedId] = useState("trade");
  const selected = ontologyConcepts.find((c) => c.id === selectedId)!;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="font-serif text-3xl font-bold text-slate-900 mb-1">
          Semantic Layer
        </h2>
        <p className="text-slate-500">
          Browse the FIBO ontology stored in GraphDB. Explore definitions, properties,
          SHACL constraints, and related concepts.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div>
          <Card className="border-slate-200 shadow-sm sticky top-0">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                Ontology Browser
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <OntologyTree
                concepts={ontologyConcepts}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-6">
              <ConceptDetail concept={selected} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// Knowledge View — Neo4j Enterprise Semantic Graph
// ═══════════════════════════════════════════════════

function SemanticGraphTree({
  concepts,
  selectedId,
  onSelect,
}: {
  concepts: SemanticConcept[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const clusters: { label: string; conceptIds: string[] }[] = [
    { label: "Trading", conceptIds: ["trade", "instrument", "settlement"] },
    { label: "Customer", conceptIds: ["customer", "account"] },
    { label: "Risk", conceptIds: ["position"] },
    { label: "Reference", conceptIds: ["counterparty", "issuer", "country"] },
  ];

  const getConcept = (id: string) => concepts.find((c) => c.id === id)!;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 px-2 py-2">
        <Building2 className="w-4 h-4 text-teal-700" />
        <span className="font-bold text-slate-800 text-sm">ABC Bank</span>
      </div>

      {clusters.map((cluster) => (
        <div key={cluster.label} className="ml-3 border-l border-slate-200 pl-3 space-y-0.5">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-2 py-1">
            {cluster.label}
          </div>
          {cluster.conceptIds.map((cid) => {
            const concept = getConcept(cid);
            const isSelected = selectedId === cid;
            return (
              <button
                key={cid}
                onClick={() => onSelect(cid)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors text-left",
                  isSelected
                    ? "bg-teal-50 text-teal-800 font-medium ring-1 ring-teal-200"
                    : "hover:bg-slate-50 text-slate-600"
                )}
              >
                <Network className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>{concept.name}</span>
                <code className="text-xs text-slate-400 ml-auto font-mono">
                  {concept.instances}
                </code>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Tab Panels ──

function OverviewTab({ concept }: { concept: SemanticConcept }) {
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h3 className="font-serif text-2xl font-bold text-slate-900">
            {concept.name}
          </h3>
          <code className="text-sm text-teal-600 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-100">
            {concept.fiboClass}
          </code>
        </div>
        <p className="text-slate-600 leading-relaxed">{concept.description}</p>
      </div>

      {/* Ontology hierarchy breadcrumbs */}
      <div>
        <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">
          Ontology Hierarchy
        </h4>
        <div className="flex items-center gap-1.5 flex-wrap p-3 rounded-lg bg-slate-50 border border-slate-100">
          {concept.hierarchy.map((cls, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}
              <span
                className={cn(
                  "text-sm",
                  idx === concept.hierarchy.length - 1
                    ? "font-semibold text-teal-700"
                    : "text-slate-500"
                )}
              >
                {cls}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 rounded-xl bg-teal-50 border border-teal-100">
          <div className="flex items-center gap-2 mb-1">
            <Boxes className="w-4 h-4 text-teal-600" />
            <span className="text-xs font-medium text-teal-700 uppercase tracking-wide">
              Instances
            </span>
          </div>
          <p className="text-2xl font-bold text-teal-900">{concept.instances}</p>
        </div>
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-medium text-emerald-700 uppercase tracking-wide">
              Properties
            </span>
          </div>
          <p className="text-2xl font-bold text-emerald-900">{concept.properties.length}</p>
        </div>
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-2 mb-1">
            <Gauge className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">
              Coverage
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800">{concept.coverage}%</p>
        </div>
      </div>

      {/* Provenance */}
      <div>
        <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2">
          <History className="w-4 h-4 text-teal-600" />
          Provenance
        </h4>
        <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Origin</span>
            <span className="text-sm font-medium text-slate-800">{concept.provenance.origin}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Created by</span>
            <span className="text-sm font-medium text-slate-800">{concept.provenance.createdBy}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Approved by</span>
            <span className="text-sm font-medium text-slate-800">{concept.provenance.approvedBy}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Confidence</span>
            <Badge className="bg-teal-100 text-teal-800 border border-teal-200">
              {concept.provenance.confidence}%
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Last synced</span>
            <span className="text-sm font-medium text-slate-800">{concept.provenance.lastSynced}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function RelationshipsTab({ concept }: { concept: SemanticConcept }) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
          <Link2 className="w-4 h-4 text-emerald-600" />
          Semantic Relationships
        </h4>
        <div className="space-y-2">
          {concept.relationships.map((rel, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 p-3 rounded-lg bg-white border border-slate-200 hover:border-teal-200 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                <Link2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="flex-1">
                <code className="text-sm font-mono font-semibold text-teal-700">
                  {rel.label}
                </code>
                <div className="flex items-center gap-2 mt-0.5">
                  <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
                  <span className="text-sm font-medium text-slate-700">{rel.target}</span>
                </div>
              </div>
              <Badge variant="outline" className="text-xs text-slate-500 border-slate-200">
                {rel.count} edges
              </Badge>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
          Frequently Connected
        </h4>
        <div className="flex flex-wrap gap-2">
          {concept.relationships.map((rel, idx) => (
            <button
              key={idx}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 hover:bg-teal-50 hover:border-teal-200 transition-colors text-sm"
            >
              <Network className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-medium text-slate-700">{rel.target}</span>
              <span className="text-xs text-slate-400">{rel.count}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PropertiesTab({ concept }: { concept: SemanticConcept }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
        <Layers className="w-4 h-4 text-teal-600" />
        FIBO Properties ({concept.properties.length})
      </h4>
      {concept.properties.map((prop) => (
        <div
          key={prop.name}
          className="flex items-center gap-3 p-3 rounded-lg bg-white border border-slate-200"
        >
          <code className="text-sm font-mono font-medium text-slate-800 w-48 shrink-0">
            {prop.name}
          </code>
          <Badge variant="outline" className="text-xs text-slate-500 border-slate-200">
            {prop.type}
          </Badge>
          <code className="text-xs text-teal-600 font-mono ml-auto">
            {prop.fiboProp}
          </code>
        </div>
      ))}
    </div>
  );
}

function MappingsTab({ concept }: { concept: SemanticConcept }) {
  const statusConfig = {
    complete: { color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2, label: "Complete" },
    partial: { color: "bg-amber-100 text-amber-700 border-amber-200", icon: AlertTriangle, label: "Partial" },
    candidate: { color: "bg-slate-100 text-slate-600 border-slate-200", icon: Clock, label: "Candidate" },
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
          <Database className="w-4 h-4 text-teal-600" />
          Data Source Mappings
        </h4>
        {concept.dataSources.map((source) => (
          <div key={source.system} className="space-y-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">
              <Database className="w-4 h-4 text-teal-600" />
              <span className="font-semibold text-slate-800 text-sm">{source.system}</span>
              <Badge variant="outline" className="text-xs text-slate-500 border-slate-200 ml-auto">
                {source.mappingCount} datasets
              </Badge>
            </div>
            <div className="ml-4 space-y-1.5">
              {source.mappings.map((mapping) => {
                const config = statusConfig[mapping.status];
                const Icon = config.icon;
                return (
                  <div
                    key={mapping.table}
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-white border border-slate-200"
                  >
                    <Table2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <code className="text-sm font-mono text-slate-700 flex-1">
                      {mapping.table}
                    </code>
                    <span className="text-xs text-slate-400">{mapping.columns} cols</span>
                    <Badge className={cn("border", config.color)}>
                      <Icon className="w-3 h-3 mr-1" />
                      {config.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineageTab({ concept }: { concept: SemanticConcept }) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
        <GitBranch className="w-4 h-4 text-teal-600" />
        Data Lineage
      </h4>
      <div className="space-y-0">
        {concept.lineage.map((step, idx) => (
          <div key={idx}>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-white border border-slate-200">
              <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-teal-700">{idx + 1}</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800">{step.step}</span>
                  <Badge variant="outline" className="text-xs text-slate-500 border-slate-200">
                    {step.source}
                  </Badge>
                </div>
                <p className="text-sm text-slate-600 mt-1">{step.detail}</p>
              </div>
            </div>
            {idx < concept.lineage.length - 1 && (
              <div className="flex justify-center py-1">
                <ArrowRight className="w-4 h-4 text-slate-300 rotate-90" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ValidationTab({ concept }: { concept: SemanticConcept }) {
  return (
    <div className="space-y-5">
      {/* SHACL Validation */}
      <div>
        <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-amber-600" />
          SHACL Validation
        </h4>
        <div className="space-y-1.5">
          {concept.validation.passed.map((rule, idx) => (
            <div key={`p${idx}`} className="flex items-center gap-3 p-2.5 rounded-lg bg-emerald-50/50 border border-emerald-100">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <code className="text-sm font-mono text-slate-700">{rule.rule}</code>
              <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200 ml-auto">Passed</Badge>
            </div>
          ))}
          {concept.validation.failed.map((rule, idx) => (
            <div key={`f${idx}`} className="flex items-center gap-3 p-2.5 rounded-lg bg-rose-50/50 border border-rose-100">
              <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <div className="flex-1">
                <code className="text-sm font-mono text-slate-700">{rule.rule}</code>
                <p className="text-xs text-rose-600 mt-0.5">{rule.detail}</p>
              </div>
              <Badge className="bg-rose-100 text-rose-700 border border-rose-200">Failed</Badge>
            </div>
          ))}
          {concept.validation.warnings.map((rule, idx) => (
            <div key={`w${idx}`} className="flex items-center gap-3 p-2.5 rounded-lg bg-amber-50/50 border border-amber-100">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <div className="flex-1">
                <code className="text-sm font-mono text-slate-700">{rule.rule}</code>
                <p className="text-xs text-amber-700 mt-0.5">{rule.detail}</p>
              </div>
              <Badge className="bg-amber-100 text-amber-700 border border-amber-200">Warning</Badge>
            </div>
          ))}
        </div>
      </div>

      {/* Data Quality */}
      <div>
        <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
          <Gauge className="w-4 h-4 text-teal-600" />
          Data Quality Score
        </h4>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(concept.quality).map(([key, value]) => (
            <div key={key} className="p-3 rounded-lg bg-white border border-slate-200">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-slate-600 capitalize">{key}</span>
                <span className="text-sm font-bold text-slate-900">{value}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    value >= 95 ? "bg-emerald-500" : value >= 85 ? "bg-teal-500" : "bg-amber-500"
                  )}
                  style={{ width: `${value}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AIInsightsTab({ concept }: { concept: SemanticConcept }) {
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-gradient-to-br from-violet-50 to-teal-50 border border-violet-100">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-violet-600" />
          </div>
          <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
            AI Explanation
          </h4>
        </div>
        <div className="space-y-3">
          {concept.aiInsights.map((insight, idx) => (
            <p key={idx} className="text-sm text-slate-700 leading-relaxed">
              {insight}
            </p>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-600" />
          Suggested Queries
        </h4>
        <div className="space-y-2">
          {concept.aiQueries.map((query, idx) => (
            <button
              key={idx}
              className="w-full flex items-center gap-3 p-3 rounded-lg bg-white border border-slate-200 hover:border-violet-200 hover:bg-violet-50/30 transition-colors text-left"
            >
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="text-sm text-slate-700 flex-1">{query}</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function QueryTab({ concept }: { concept: SemanticConcept }) {
  const cypherQuery = `MATCH (n:${concept.name})-[r]->(target)
RETURN type(r) AS relationship,
       labels(target) AS targetConcept,
       count(r) AS edgeCount
ORDER BY edgeCount DESC
LIMIT 25;`;

  const sparqlQuery = `PREFIX fibo: <https://spec.edmcouncil.org/fibo/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?instance ?property ?value
WHERE {
  ?instance a ${concept.fiboClass} .
  ?instance ?property ?value .
}
LIMIT 100`;

  const sqlQuery = `-- Natural language: "Show me all ${concept.name.toLowerCase()}s"
SELECT *
FROM ${concept.dataSources[0]?.mappings[0]?.table ?? "unknown_table"}
LIMIT 100;`;

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2">
          <Code2 className="w-4 h-4 text-teal-600" />
          Cypher (Neo4j)
        </h4>
        <pre className="text-xs font-mono text-slate-600 bg-teal-50 p-3 rounded-lg border border-teal-100 overflow-x-auto whitespace-pre-wrap">
          {cypherQuery}
        </pre>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2">
          <Code2 className="w-4 h-4 text-violet-600" />
          SPARQL (GraphDB)
        </h4>
        <pre className="text-xs font-mono text-slate-600 bg-violet-50 p-3 rounded-lg border border-violet-100 overflow-x-auto whitespace-pre-wrap">
          {sparqlQuery}
        </pre>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2">
          <Database className="w-4 h-4 text-slate-600" />
          SQL (Databricks)
        </h4>
        <pre className="text-xs font-mono text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200 overflow-x-auto whitespace-pre-wrap">
          {sqlQuery}
        </pre>
      </div>
    </div>
  );
}

function HistoryTab({ concept }: { concept: SemanticConcept }) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
        <History className="w-4 h-4 text-teal-600" />
        Change History
      </h4>
      <div className="space-y-0">
        {concept.history.map((entry, idx) => (
          <div key={idx} className="flex items-start gap-3 pb-4 relative">
            {idx < concept.history.length - 1 && (
              <div className="absolute left-[15px] top-8 bottom-0 w-px bg-slate-200" />
            )}
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10",
              entry.user === "GraphOS Agent" ? "bg-violet-100" : "bg-teal-100"
            )}>
              <span className="text-xs font-bold text-slate-700">
                {entry.user.charAt(0)}
              </span>
            </div>
            <div className="flex-1 pb-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-800">{entry.user}</span>
                {entry.user === "GraphOS Agent" && (
                  <Badge className="bg-violet-100 text-violet-700 border border-violet-200 text-xs">
                    <Sparkles className="w-2.5 h-2.5 mr-1" />
                    AI
                  </Badge>
                )}
              </div>
              <p className="text-sm text-slate-600 mt-0.5">{entry.action}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <Clock className="w-3 h-3 text-slate-400" />
                <span className="text-xs text-slate-400">{entry.timestamp}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SemanticIntelligencePanel({ concept }: { concept: SemanticConcept }) {
  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="grid grid-cols-2 sm:grid-cols-4 gap-1 mb-4 h-auto w-full">
        <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
        <TabsTrigger value="relationships" className="text-xs">Relationships</TabsTrigger>
        <TabsTrigger value="properties" className="text-xs">Properties</TabsTrigger>
        <TabsTrigger value="mappings" className="text-xs">Mappings</TabsTrigger>
        <TabsTrigger value="lineage" className="text-xs">Lineage</TabsTrigger>
        <TabsTrigger value="validation" className="text-xs">Validation</TabsTrigger>
        <TabsTrigger value="ai" className="text-xs">AI Insights</TabsTrigger>
        <TabsTrigger value="query" className="text-xs">Query</TabsTrigger>
      </TabsList>
      <TabsContent value="overview"><OverviewTab concept={concept} /></TabsContent>
      <TabsContent value="relationships"><RelationshipsTab concept={concept} /></TabsContent>
      <TabsContent value="properties"><PropertiesTab concept={concept} /></TabsContent>
      <TabsContent value="mappings"><MappingsTab concept={concept} /></TabsContent>
      <TabsContent value="lineage"><LineageTab concept={concept} /></TabsContent>
      <TabsContent value="validation"><ValidationTab concept={concept} /></TabsContent>
      <TabsContent value="ai"><AIInsightsTab concept={concept} /></TabsContent>
      <TabsContent value="query"><QueryTab concept={concept} /></TabsContent>
    </Tabs>
  );
}

export function KnowledgeView() {
  const [selectedId, setSelectedId] = useState("trade");
  const selected = semanticConcepts.find((c) => c.id === selectedId)!;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="font-serif text-3xl font-bold text-slate-900 mb-1">
          Knowledge Layer
        </h2>
        <p className="text-slate-500">
          The enterprise semantic graph in Neo4j. This is your organization's live
          instantiation of FIBO concepts — purely semantic, with relationship edges
          between concepts and underlying data mappings.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Semantic graph tree */}
        <div className="lg:col-span-2">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 pb-3">
              <CardTitle className="font-serif text-lg text-slate-800">
                ABC Bank · Semantic Graph
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <SemanticGraphTree
                concepts={semanticConcepts}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right: Semantic Intelligence Panel */}
        <div className="lg:col-span-3">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-6">
              <SemanticIntelligencePanel concept={selected} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// Knowledge Graph View — Interactive Visual Canvas
// ═══════════════════════════════════════════════════

const nodeColors: Record<GraphNode["type"], { fill: string; stroke: string; text: string; chip: string }> = {
  concept: { fill: "bg-teal-50", stroke: "border-teal-400", text: "text-teal-800", chip: "bg-teal-600 text-white" },
  entity: { fill: "bg-emerald-50", stroke: "border-emerald-400", text: "text-emerald-800", chip: "bg-emerald-600 text-white" },
  data: { fill: "bg-slate-50", stroke: "border-slate-300", text: "text-slate-700", chip: "bg-slate-500 text-white" },
};

function GraphCanvas({
  nodes,
  edges,
  selectedId,
  onSelect,
}: {
  nodes: GraphNode[];
  edges: { from: string; to: string; label: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(
    () => Object.fromEntries(nodes.map((n) => [n.id, { x: n.x, y: n.y }]))
  );
  const [dragging, setDragging] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string | null) => {
      e.stopPropagation();
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (nodeId) {
        setDragging(nodeId);
        onSelect(nodeId);
        // keep the grab offset so the node doesn't snap its center to the cursor
        const pos = positions[nodeId];
        dragStart.current = {
          x: e.clientX - rect.left - pan.x - (pos?.x ?? 0),
          y: e.clientY - rect.top - pan.y - (pos?.y ?? 0),
        };
      } else {
        setIsPanning(true);
        dragStart.current = { x: e.clientX - rect.left - pan.x, y: e.clientY - rect.top - pan.y };
      }
    },
    [pan, positions, onSelect]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragStart.current) return;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const start = dragStart.current;

      if (dragging) {
        setPositions((prev) => ({
          ...prev,
          [dragging]: { x: x - pan.x - start.x, y: y - pan.y - start.y },
        }));
      } else if (isPanning) {
        setPan({ x: x - start.x, y: y - start.y });
      }
    },
    [dragging, isPanning, pan]
  );

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setIsPanning(false);
    dragStart.current = null;
  }, []);

  return (
    <div className="relative w-full h-full bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/90 backdrop-blur shadow-sm border border-slate-200">
        <Move className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-xs text-slate-500">Drag nodes · Click to inspect</span>
      </div>

      <svg
        ref={svgRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={(e) => handleMouseDown(e, null)}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="10" cy="10" r="1" fill="rgb(203 213 225)" opacity="0.4" />
          </pattern>
          <marker id="arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(148 163 184)" />
          </marker>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        <g transform={`translate(${pan.x}, ${pan.y})`}>
          {edges.map((edge, idx) => {
            const from = positions[edge.from];
            const to = positions[edge.to];
            if (!from || !to) return null;
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;
            // size the label pill to its text so long labels don't overflow
            const labelWidth = edge.label.length * 6 + 16;
            return (
              <g key={idx}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="rgb(148 163 184)"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                  markerEnd="url(#arrow)"
                />
                <rect
                  x={midX - labelWidth / 2}
                  y={midY - 9}
                  width={labelWidth}
                  height="18"
                  rx="9"
                  fill="white"
                  stroke="rgb(226 232 240)"
                  strokeWidth="1"
                />
                <text
                  x={midX}
                  y={midY + 4}
                  textAnchor="middle"
                  className="fill-slate-500 font-mono"
                  style={{ fontSize: "10px" }}
                >
                  {edge.label}
                </text>
              </g>
            );
          })}

          {nodes.map((node) => {
            const pos = positions[node.id];
            if (!pos) return null;
            const colors = nodeColors[node.type];
            const isSelected = selectedId === node.id;
            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                onMouseDown={(e) => handleMouseDown(e, node.id)}
                style={{ cursor: "grab" }}
                className="active:cursor-grabbing"
              >
                {isSelected && (
                  <circle r="42" fill="none" stroke="rgb(20 184 166)" strokeWidth="2" strokeDasharray="3 3" opacity="0.5" />
                )}
                <circle
                  r="32"
                  className={cn(colors.fill)}
                  fill="currentColor"
                  opacity="0.15"
                />
                <circle
                  r="32"
                  fill="white"
                  stroke={isSelected ? "rgb(20 184 166)" : "rgb(148 163 184)"}
                  strokeWidth={isSelected ? "2.5" : "1.5"}
                />
                <text
                  y="-2"
                  textAnchor="middle"
                  className="font-semibold"
                  fill="rgb(15 23 42)"
                  style={{ fontSize: "11px" }}
                >
                  {node.label}
                </text>
                <text
                  y="10"
                  textAnchor="middle"
                  fill="rgb(100 116 139)"
                  style={{ fontSize: "8px" }}
                >
                  {node.confidence}%
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function NodeDetailPanel({ node }: { node: GraphNode }) {
  const colors = nodeColors[node.type];
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold", colors.chip)}>
            {node.type}
          </span>
          <h3 className="font-serif text-2xl font-bold text-slate-900">
            {node.label}
          </h3>
          <code className="text-sm text-teal-600 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-100">
            {node.fiboClass}
          </code>
        </div>
        <p className="text-slate-600 leading-relaxed">{node.definition}</p>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2">
          <Database className="w-4 h-4 text-teal-600" />
          Databricks Tables
        </h4>
        <div className="flex flex-wrap gap-2">
          {node.tables.map((table) => (
            <code
              key={table}
              className="text-xs font-mono text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200"
            >
              {table}
            </code>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2">
          <FileText className="w-4 h-4 text-teal-600" />
          Sample Data
        </h4>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {Object.keys(node.sampleData[0]).map((key) => (
                  <th
                    key={key}
                    className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide"
                  >
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {node.sampleData.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  {Object.values(row).map((val, vidx) => (
                    <td key={vidx} className="px-3 py-2 font-mono text-xs text-slate-700">
                      {val}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2">
            <Code2 className="w-4 h-4 text-violet-600" />
            SPARQL
          </h4>
          <pre className="text-xs font-mono text-slate-600 bg-violet-50 p-3 rounded-lg border border-violet-100 overflow-x-auto whitespace-pre-wrap">
            {node.sparql}
          </pre>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2">
            <Network className="w-4 h-4 text-teal-600" />
            Cypher
          </h4>
          <pre className="text-xs font-mono text-slate-600 bg-teal-50 p-3 rounded-lg border border-teal-100 overflow-x-auto whitespace-pre-wrap">
            {node.cypher}
          </pre>
        </div>
      </div>
    </div>
  );
}

export function KnowledgeGraphView() {
  const [selectedId, setSelectedId] = useState("trade");
  const selected = graphNodes.find((n) => n.id === selectedId)!;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="font-serif text-3xl font-bold text-slate-900 mb-1">
          Knowledge Graph
        </h2>
        <p className="text-slate-500">
          An interactive semantic map of your enterprise. Drag nodes to rearrange,
          click any node to inspect its FIBO class, Databricks tables, sample data,
          and query definitions.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:h-[640px]">
        <div className="lg:col-span-3 h-[420px] lg:h-auto">
          <GraphCanvas
            nodes={graphNodes}
            edges={graphEdges}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        <div className="lg:col-span-2 overflow-y-auto">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-6">
              <NodeDetailPanel node={selected} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}