import { useState } from "react";
import { CheckCircle2, Clock, Network, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type { AlignmentQueue } from "@/api/ontology";
import { groupByBand } from "../alignmentBands";

export type BulkAcceptResult = { accepted: number; failed: number };

type AlignmentDashboardProps = {
  queue: AlignmentQueue;
  onBulkAccept: (thresholdPercent: number) => Promise<BulkAcceptResult>;
};

type BulkStatus = { kind: "idle" } | { kind: "running" } | { kind: "done"; result: BulkAcceptResult };

export function AlignmentDashboard({ queue, onBulkAccept }: AlignmentDashboardProps) {
  const [threshold, setThreshold] = useState(70);
  const [status, setStatus] = useState<BulkStatus>({ kind: "idle" });

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

  async function handleBulkAccept() {
    setStatus({ kind: "running" });
    const result = await onBulkAccept(threshold);
    setStatus({ kind: "done", result });
  }

  return (
    <section aria-label="Alignment summary" className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
      </div>
      <p className="text-xs text-slate-500">
        Average candidate score across every term: <b>{avgScore}%</b>
      </p>
      <Separator />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="bulk-accept-threshold" className="text-xs font-medium text-slate-600">
          Minimum confidence (%)
        </label>
        <Input
          id="bulk-accept-threshold"
          type="number"
          min={0}
          max={100}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="w-20"
        />
        <Button
          size="sm"
          disabled={status.kind === "running"}
          onClick={() => void handleBulkAccept()}
        >
          {status.kind === "running" ? "Accepting…" : "Accept all above threshold"}
        </Button>
        {status.kind === "done" && (
          <span className="text-xs text-slate-500">
            Done — {status.result.accepted} accepted
            {status.result.failed > 0 ? `, ${status.result.failed} failed` : ""}
          </span>
        )}
      </div>
    </section>
  );
}
