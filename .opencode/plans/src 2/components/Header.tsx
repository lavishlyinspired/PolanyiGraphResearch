import React from "react";
import { CheckCircle2, Clock, XCircle, GitBranch } from "lucide-react";

interface HeaderProps {
  stats: {
    approved: number;
    pending: number;
    rejected: number;
    total: number;
  };
}

export function Header({ stats }: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
          <GitBranch className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-serif text-xl font-bold leading-tight text-slate-900">
            FIBO Alignment Studio
          </h1>
          <p className="text-xs text-slate-500">
            Financial Ontology Reconciliation · Neo4j ↔ Databricks
          </p>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span className="text-sm font-medium text-slate-700">{stats.approved} Approved</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-medium text-slate-700">{stats.pending} Pending</span>
        </div>
        <div className="flex items-center gap-2">
          <XCircle className="h-4 w-4 text-rose-500" />
          <span className="text-sm font-medium text-slate-700">{stats.rejected} Rejected</span>
        </div>
        <div className="h-6 w-px bg-slate-200" />
        <div className="text-sm text-slate-500">
          <span className="font-semibold text-slate-900">{stats.total}</span> total mappings
        </div>
      </div>
    </header>
  );
}