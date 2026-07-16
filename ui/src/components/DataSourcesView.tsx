import { useEffect, useState } from "react";
import {
  dataSources as fallbackSources,
  catalogs as fallbackCatalogs,
  discoveryStats as fallbackStats,
  enterpriseSummary,
  type CatalogNode,
  type DataSource,
} from "@/data/mockData";
import {
  getContext,
  getSchema,
  getSources,
  type ApiContext,
  type ApiSchema,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronRight,
  ChevronDown,
  Database,
  CheckCircle2,
  Sparkles,
  Table2,
  Columns3,
  Link2,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

function CatalogTree({ nodes, depth = 0 }: { nodes: CatalogNode[]; depth?: number }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    finance: true,
  });

  const toggle = (name: string) =>
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));

  return (
    <div className="space-y-0.5">
      {nodes.map((node) => {
        const isOpen = expanded[node.name] ?? depth === 0;
        const hasChildren = node.children && node.children.length > 0;
        return (
          <div key={node.name}>
            <button
              onClick={() => hasChildren && toggle(node.name)}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-teal-50 transition-colors text-left",
                depth > 0 && "ml-4"
              )}
            >
              {hasChildren ? (
                isOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                )
              ) : (
                <span className="w-3.5 shrink-0" />
              )}
              <Database
                className={cn(
                  "w-3.5 h-3.5 shrink-0",
                  depth === 0 ? "text-teal-600" : "text-slate-400"
                )}
              />
              <span
                className={cn(
                  depth === 0 ? "font-medium text-slate-800" : "text-slate-600"
                )}
              >
                {node.name}
              </span>
              {node.count !== undefined && (
                <span className="ml-auto text-xs text-slate-400">
                  {node.count} {depth === 0 ? "tables" : ""}
                </span>
              )}
            </button>
            {isOpen && hasChildren && (
              <CatalogTree nodes={node.children!} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: typeof Table2;
  label: string;
  value: string;
  tint: string;
}) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-5 flex items-center gap-4">
        <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center", tint)}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-900 leading-none">{value}</p>
          <p className="text-sm text-slate-500 mt-1">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function catalogsFromSchema(schema: ApiSchema): CatalogNode[] {
  return [
    {
      name: schema.dialect,
      count: schema.tables.length,
      children: schema.tables.map((table) => ({
        name: table.name,
        count: table.columns.length,
      })),
    },
  ];
}

function statsFromApi(schema: ApiSchema, context: ApiContext | null) {
  const columns = schema.tables.reduce((sum, t) => sum + t.columns.length, 0);
  const relationships =
    context?.relationships.length ??
    schema.tables.reduce((sum, t) => sum + t.foreign_keys.length, 0);
  const coveredTables = new Set(
    (context?.glossary ?? []).flatMap((entry) => entry.source_tables)
  );
  const coverage =
    schema.tables.length > 0 && context
      ? Math.round((coveredTables.size / schema.tables.length) * 100)
      : 0;
  return { tables: schema.tables.length, columns, relationships, coverage };
}

export function DataSourcesView() {
  const [selectedSource, setSelectedSource] = useState("databricks");
  const [showSummary, setShowSummary] = useState(false);
  const [live, setLive] = useState<{
    sources: DataSource[];
    catalogs: CatalogNode[];
    stats: typeof fallbackStats;
    catalogTitle: string;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      const [sources, schema, context] = await Promise.all([
        getSources(),
        getSchema(),
        getContext(),
      ]);
      if (!sources || !schema) return;
      setLive({
        sources: sources.map((s) => ({
          id: s.name,
          name: s.name,
          type: s.dialect,
          connected: s.status === "connected",
          detail: `${s.uri} · ${s.table_count} tables`,
        })),
        catalogs: catalogsFromSchema(schema),
        stats: statsFromApi(schema, context),
        catalogTitle: `${schema.dialect} · live schema`,
      });
    })();
  }, []);

  const dataSources = live?.sources ?? fallbackSources;
  const catalogs = live?.catalogs ?? fallbackCatalogs;
  const discoveryStats = live?.stats ?? fallbackStats;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Explain My Enterprise banner */}
      <Card className="mb-8 bg-gradient-to-br from-teal-50 to-emerald-50 border-teal-200 shadow-md">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-teal-600 flex items-center justify-center shrink-0 shadow-md">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="font-serif text-xl font-bold text-teal-950 mb-1">
                Explain My Enterprise
              </h2>
              <p className="text-sm text-teal-800 leading-relaxed">
                {showSummary ? (
                  <>
                    I discovered <strong>{enterpriseSummary.totalTables} tables</strong>. About{" "}
                    <strong>{enterpriseSummary.trading}%</strong> relate to trading,{" "}
                    <strong>{enterpriseSummary.customer}%</strong> to customer data, and{" "}
                    <strong>{enterpriseSummary.risk}%</strong> to risk. I identified{" "}
                    <strong>{enterpriseSummary.fiboConcepts} FIBO business concepts</strong>,
                    inferred <strong>{enterpriseSummary.inferredRelationships} relationships</strong>,
                    and found <strong>{enterpriseSummary.unclassified} tables</strong> that could
                    not be confidently classified.
                  </>
                ) : (
                  "Automatically generate a semantic summary of your enterprise data landscape on first connection."
                )}
              </p>
            </div>
            <Button
              onClick={() => setShowSummary(true)}
              disabled={showSummary}
              className="bg-teal-600 hover:bg-teal-700 text-white shrink-0"
            >
              {showSummary ? "Generated ✓" : "Generate Summary"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Discovery stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Table2} label="Tables Discovered" value={discoveryStats.tables.toLocaleString()} tint="bg-teal-100 text-teal-700" />
        <StatCard icon={Columns3} label="Columns" value={discoveryStats.columns.toLocaleString()} tint="bg-emerald-100 text-emerald-700" />
        <StatCard icon={Link2} label="Relationships" value={discoveryStats.relationships.toLocaleString()} tint="bg-cyan-100 text-cyan-700" />
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-4 mb-3">
              <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 leading-none">{discoveryStats.coverage}%</p>
                <p className="text-sm text-slate-500 mt-1">Semantic Coverage</p>
              </div>
            </div>
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full"
                style={{ width: `${discoveryStats.coverage}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Source cards */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Connected Sources
          </h3>
          {dataSources.map((source) => (
            <Card
              key={source.id}
              className={cn(
                "cursor-pointer transition-all border-slate-200 shadow-sm hover:shadow-md",
                selectedSource === source.id
                  ? "ring-2 ring-teal-500 border-teal-400"
                  : "hover:border-slate-300"
              )}
              onClick={() => setSelectedSource(source.id)}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div
                  className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                    source.connected
                      ? "bg-teal-100 text-teal-700"
                      : "bg-slate-100 text-slate-400"
                  )}
                >
                  <Database className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 text-sm">{source.name}</p>
                  <p className="text-xs text-slate-500 truncate">{source.detail}</p>
                </div>
                {source.connected && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Catalog tree */}
        <div className="lg:col-span-2">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="font-serif text-lg text-slate-800">
                  {live?.catalogTitle ?? "Databricks · Unity Catalog (demo)"}
                </CardTitle>
                <Badge variant="secondary" className="bg-teal-50 text-teal-700 border border-teal-200">
                  {discoveryStats.tables} tables
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <CatalogTree nodes={catalogs} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}