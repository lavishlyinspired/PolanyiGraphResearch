import { useEffect, useState } from "react";
import {
  getSchema,
  getContext,
  type ApiSchema,
  type ApiContext,
  type ApiTable,
  type ApiColumn,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  X,
  ArrowRight,
  HelpCircle,
  Table2,
  Lightbulb,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ColumnMapping = {
  column: string;
  type: string;
  nullable: boolean;
  primary_key: boolean;
  fiboClass: string | null;
  fiboUri: string | null;
  confidence: number;
  status: "accepted" | "rejected" | "pending";
  rationale: string;
};

type TableMapping = {
  table: string;
  schema: string;
  columns: ColumnMapping[];
  detectedConcepts: { name: string; confidence: number }[];
};

function buildMappings(schema: ApiSchema, context: ApiContext | null): TableMapping[] {
  const glossaryByColumn: Record<string, { term: string; ontologyClass: string | null; ontologyUri: string | null }> = {};
  (context?.glossary ?? []).forEach((g) => {
    g.source_columns.forEach((col) => {
      glossaryByColumn[col] = { term: g.term, ontologyClass: g.ontology_class, ontologyUri: g.ontology_uri };
    });
  });

  const glossaryByTable: Record<string, string[]> = {};
  (context?.glossary ?? []).forEach((g) => {
    g.source_tables.forEach((t) => {
      if (!glossaryByTable[t]) glossaryByTable[t] = [];
      glossaryByTable[t].push(g.term);
    });
  });

  return schema.tables.map((table) => {
    const parts = table.name.split(".");
    const schemaName = parts.length > 1 ? parts[0] : "default";
    const tableName = parts.length > 1 ? parts.slice(1).join(".") : table.name;

    const detectedConcepts = (glossaryByTable[table.name] ?? []).map((term) => {
      const g = context?.glossary.find((e) => e.term === term);
      return { name: term, confidence: g?.ontology_class ? 95 : 70 };
    });

    const columns: ColumnMapping[] = table.columns.map((col) => {
      const matched = glossaryByColumn[col.name] ?? glossaryByColumn[`${table.name}.${col.name}`];
      const fiboClass = matched?.ontologyClass ?? null;
      const fiboUri = matched?.ontologyUri ?? null;
      const confidence = fiboClass ? 92 : col.primary_key ? 80 : col.name.includes("_id") ? 60 : 30;
      const status: ColumnMapping["status"] = fiboClass ? "accepted" : confidence >= 60 ? "pending" : "pending";
      const rationale = matched
        ? `Mapped to glossary term "${matched.term}"${fiboClass ? ` → fibo:${fiboClass}` : ""}`
        : col.primary_key
        ? "Primary key — structural column"
        : "No glossary mapping found";

      return {
        column: col.name,
        type: col.type,
        nullable: col.nullable,
        primary_key: col.primary_key,
        fiboClass,
        fiboUri,
        confidence,
        status,
        rationale,
      };
    });

    return { table: tableName, schema: schemaName, columns, detectedConcepts };
  });
}

function confidenceColor(confidence: number) {
  if (confidence >= 90) return "text-emerald-600 bg-emerald-50 border-emerald-200";
  if (confidence >= 75) return "text-teal-600 bg-teal-50 border-teal-200";
  if (confidence >= 60) return "text-amber-600 bg-amber-50 border-amber-200";
  return "text-rose-600 bg-rose-50 border-rose-200";
}

function StatusIcon({ status }: { status: ColumnMapping["status"] }) {
  if (status === "accepted") return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  if (status === "rejected") return <XCircle className="w-4 h-4 text-rose-400" />;
  return <Clock className="w-4 h-4 text-amber-400" />;
}

export function AlignmentWorkbench() {
  const [schema, setSchema] = useState<ApiSchema | null>(null);
  const [context, setContext] = useState<ApiContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [mappings, setMappings] = useState<TableMapping[]>([]);
  const [selectedTable, setSelectedTable] = useState(0);
  const [expandedRationale, setExpandedRationale] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [sc, ctx] = await Promise.all([getSchema(), getContext()]);
      if (sc) setSchema(sc);
      if (ctx) setContext(ctx);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (schema) {
      setMappings(buildMappings(schema, context));
    }
  }, [schema, context]);

  const updateColumnStatus = (
    tableIdx: number,
    columnIdx: number,
    status: ColumnMapping["status"]
  ) => {
    setMappings((prev) => {
      const next = [...prev];
      next[tableIdx] = {
        ...next[tableIdx],
        columns: next[tableIdx].columns.map((col, i) =>
          i === columnIdx ? { ...col, status } : col
        ),
      };
      return next;
    });
  };

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto flex items-center justify-center h-96">
        <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
        <span className="ml-3 text-slate-500">Loading schema for alignment...</span>
      </div>
    );
  }

  if (!schema || mappings.length === 0) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-12 text-center">
            <Table2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2">No schema data</h3>
            <p className="text-slate-500">
              Run <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm">graphos generate</code> to
              introspect your database schema first.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const current = mappings[selectedTable];
  const acceptedCount = current.columns.filter((c) => c.status === "accepted").length;
  const totalCount = current.columns.length;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="font-serif text-3xl font-bold text-slate-900 mb-1">
          Alignment Workbench
        </h2>
        <p className="text-slate-500">
          Column-to-FIBO mappings derived from {schema.dialect} schema + semantic context.
          {mappings.length} tables, {mappings.reduce((s, m) => s + m.columns.length, 0)} columns total.
        </p>
      </div>

      {/* Table selector */}
      <div className="flex flex-wrap gap-2 mb-6">
        {mappings.map((tm, idx) => {
          const aligned = tm.columns.filter((c) => c.fiboClass).length;
          return (
            <button
              key={tm.table}
              onClick={() => setSelectedTable(idx)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border",
                selectedTable === idx
                  ? "bg-teal-600 text-white border-teal-600 shadow-md"
                  : "bg-white text-slate-600 border-slate-200 hover:border-teal-300 hover:text-teal-700"
              )}
            >
              <Table2 className="w-4 h-4" />
              {tm.schema}.{tm.table}
              {aligned > 0 && (
                <Badge className={cn("text-[10px] ml-1", selectedTable === idx ? "bg-teal-500 text-white" : "bg-emerald-100 text-emerald-700")}>
                  {aligned}/{tm.columns.length}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Detected concepts */}
        <div className="space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                Detected Concepts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {current.detectedConcepts.length > 0 ? (
                current.detectedConcepts.map((concept) => (
                  <div
                    key={concept.name}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100"
                  >
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-500" />
                      <span className="text-sm font-medium text-slate-700">
                        {concept.name}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "text-xs font-semibold px-2 py-0.5 rounded-full border",
                        confidenceColor(concept.confidence)
                      )}
                    >
                      {concept.confidence}%
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400 italic">No glossary terms map to this table.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-teal-200 bg-teal-50/50 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-600">
                  Alignment Progress
                </span>
                <span className="text-sm font-bold text-teal-700">
                  {acceptedCount}/{totalCount}
                </span>
              </div>
              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full transition-all"
                  style={{ width: `${totalCount > 0 ? (acceptedCount / totalCount) * 100 : 0}%` }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Column type breakdown */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                Column Types
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const types: Record<string, number> = {};
                current.columns.forEach((c) => { types[c.type] = (types[c.type] ?? 0) + 1; });
                return Object.entries(types).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between py-1.5">
                    <code className="text-xs font-mono text-slate-600">{type}</code>
                    <Badge variant="secondary" className="text-[10px]">{count}</Badge>
                  </div>
                ));
              })()}
            </CardContent>
          </Card>
        </div>

        {/* Right: Column mappings */}
        <div className="lg:col-span-2">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="font-serif text-lg text-slate-800">
                  Column → FIBO Mapping
                </CardTitle>
                <Badge variant="outline" className="text-slate-500">
                  {current.schema}.{current.table}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {current.columns.map((col, colIdx) => (
                <div
                  key={col.column}
                  className="border-b border-slate-100 last:border-0 p-4 hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    {/* Source column */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <StatusIcon status={col.status} />
                        <code className="text-sm font-mono font-medium text-slate-800">
                          {col.column}
                        </code>
                        {col.primary_key && (
                          <Badge className="bg-slate-100 text-slate-600 text-[10px]">PK</Badge>
                        )}
                      </div>
                      <code className="text-[10px] text-slate-400 font-mono ml-6">{col.type}</code>
                    </div>

                    {/* Arrow */}
                    <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />

                    {/* FIBO target */}
                    <div className="flex-1 min-w-0">
                      {col.fiboClass ? (
                        <>
                          <code className="text-sm font-mono text-teal-700 font-medium">
                            fibo:{col.fiboClass}
                          </code>
                          {col.fiboUri && (
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">{col.fiboUri}</p>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-slate-400 italic">No FIBO mapping</span>
                      )}
                    </div>

                    {/* Confidence */}
                    <span
                      className={cn(
                        "text-xs font-semibold px-2 py-1 rounded-full border shrink-0",
                        confidenceColor(col.confidence)
                      )}
                    >
                      {col.confidence}%
                    </span>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className={cn(
                          "h-8 w-8 p-0",
                          col.status === "accepted"
                            ? "text-emerald-600 bg-emerald-50"
                            : "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                        )}
                        onClick={() => updateColumnStatus(selectedTable, colIdx, "accepted")}
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={cn(
                          "h-8 w-8 p-0",
                          col.status === "rejected"
                            ? "text-rose-600 bg-rose-50"
                            : "text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        )}
                        onClick={() => updateColumnStatus(selectedTable, colIdx, "rejected")}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                        onClick={() =>
                          setExpandedRationale(
                            expandedRationale === col.column ? null : col.column
                          )
                        }
                      >
                        <HelpCircle className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Rationale */}
                  {expandedRationale === col.column && (
                    <div className="mt-3 ml-6 p-3 rounded-lg bg-amber-50 border border-amber-100 flex gap-2">
                      <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-900">{col.rationale}</p>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
