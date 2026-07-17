import { useState } from "react";
import { tableMappings, type ColumnMapping } from "@/data/mockData";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

function confidenceColor(confidence: number) {
  if (confidence >= 90) return "text-emerald-600 bg-emerald-50 border-emerald-200";
  if (confidence >= 75) return "text-teal-600 bg-teal-50 border-teal-200";
  if (confidence >= 60) return "text-amber-600 bg-amber-50 border-amber-200";
  return "text-rose-600 bg-rose-50 border-rose-200";
}

function StatusIcon({ status }: { status: ColumnMapping["status"] }) {
  if (status === "accepted")
    return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  if (status === "rejected")
    return <XCircle className="w-4 h-4 text-rose-400" />;
  return <Clock className="w-4 h-4 text-amber-400" />;
}

export function AlignmentWorkbench() {
  const [mappings, setMappings] = useState(tableMappings);
  const [selectedTable, setSelectedTable] = useState(0);
  const [expandedRationale, setExpandedRationale] = useState<string | null>(null);

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
          Review how enterprise tables map to FIBO ontology concepts. Accept, reject, or
          question each mapping.
        </p>
      </div>

      {/* Table selector */}
      <div className="flex gap-2 mb-6">
        {mappings.map((tm, idx) => (
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
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Detected concepts */}
        <div className="space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                Detected Concepts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {current.detectedConcepts.map((concept) => (
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
              ))}
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
                  style={{ width: `${(acceptedCount / totalCount) * 100}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Column mappings */}
        <div className="col-span-2">
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
                      </div>
                    </div>

                    {/* Arrow */}
                    <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />

                    {/* FIBO target */}
                    <div className="flex-1 min-w-0">
                      <code className="text-sm font-mono text-teal-700 font-medium">
                        {col.fiboClass}
                      </code>
                      <p className="text-xs text-slate-400 mt-0.5">{col.fiboUri}</p>
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