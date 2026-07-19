import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, Clock, Network } from "lucide-react";
import type { AlignmentLink } from "@/lib/data";

interface AlignmentDashboardProps {
  links: AlignmentLink[];
}

export function AlignmentDashboard({ links }: AlignmentDashboardProps) {
  const approved = links.filter((l) => l.status === "approved").length;
  const pending = links.filter((l) => l.status === "pending").length;
  const rejected = links.filter((l) => l.status === "rejected").length;
  const total = links.length;
  const completion = total === 0 ? 0 : Math.round(((approved + rejected) / total) * 100);

  const avgConfidence = links.length > 0 
    ? Math.round((links.reduce((acc, l) => acc + l.confidence, 0) / links.length) * 100)
    : 0;

  return (
    <div className="grid grid-cols-4 gap-4">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-slate-500">
            Approved
          </CardTitle>
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-slate-900">{approved}</div>
          <p className="text-xs text-slate-500">Confirmed mappings</p>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-slate-500">
            Pending
          </CardTitle>
          <Clock className="h-4 w-4 text-amber-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-slate-900">{pending}</div>
          <p className="text-xs text-slate-500">Awaiting review</p>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-slate-500">
            Rejected
          </CardTitle>
          <XCircle className="h-4 w-4 text-rose-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-slate-900">{rejected}</div>
          <p className="text-xs text-slate-500">Discarded mappings</p>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-slate-500">
            Avg. Confidence
          </CardTitle>
          <Network className="h-4 w-4 text-indigo-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-slate-900">{avgConfidence}%</div>
          <Progress value={avgConfidence} className="mt-2 h-1.5" />
        </CardContent>
      </Card>
    </div>
  );
}