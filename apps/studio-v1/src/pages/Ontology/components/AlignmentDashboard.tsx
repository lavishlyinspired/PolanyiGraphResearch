import { CheckCircle2, Clock, Network, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AlignmentQueue } from "@/api/ontology";
import { groupByBand } from "../alignmentBands";

type AlignmentDashboardProps = { queue: AlignmentQueue };

export function AlignmentDashboard({ queue }: AlignmentDashboardProps) {
  const bands = groupByBand(queue);
  const avgScore =
    queue.items.length === 0
      ? 0
      : Math.round((queue.items.reduce((sum, item) => sum + item.score, 0) / queue.items.length) * 100);

  const cards = [
    { label: "Aligned", count: bands.auto.length, icon: CheckCircle2, tone: "text-emerald-600" },
    { label: "Needs review", count: bands.review.length, icon: Clock, tone: "text-amber-500" },
    { label: "Rejected", count: bands.rejected.length, icon: XCircle, tone: "text-rose-500" },
    { label: "Unmapped", count: bands.unmapped.length, icon: Network, tone: "text-slate-400" },
  ];

  return (
    <section aria-label="Alignment summary" className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map(({ label, count, icon: Icon, tone }) => (
        <Card key={label}>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-xs font-medium text-slate-500">{label}</CardTitle>
            <Icon className={`h-4 w-4 ${tone}`} aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{count}</div>
          </CardContent>
        </Card>
      ))}
      <p className="col-span-2 text-xs text-slate-500 md:col-span-4">
        Average candidate score across every term: <b>{avgScore}%</b>
      </p>
    </section>
  );
}
