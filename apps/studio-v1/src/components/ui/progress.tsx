import { cn } from "@/lib/utils";

type ProgressProps = {
  value: number;
  className?: string;
};

export function Progress({ value, className }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-slate-100", className)}
    >
      <div
        className="h-full rounded-full bg-emerald-600 transition-all"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
