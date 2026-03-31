import { ArrowDownCircle, ArrowUpCircle, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: number;
  unit: string;
  tone: "teal" | "blue" | "amber";
  currency?: boolean;
}

const toneClass = {
  teal: "metric-card-teal",
  blue: "metric-card-blue",
  amber: "metric-card-amber",
};

export function MetricCard({ label, value, unit, tone, currency = false }: MetricCardProps) {
  const Icon = tone === "amber" ? ArrowDownCircle : tone === "blue" ? ArrowUpCircle : Gauge;

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 shadow-[0_8px_24px_rgba(0,0,0,0.25)]",
        toneClass[tone],
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.15em] opacity-90">{label}</p>
        <Icon className="size-4 opacity-80" />
      </div>
      <p className="font-mono text-2xl font-semibold">
        {currency ? "$" : ""}
        {value.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </p>
      <p className="text-xs opacity-80">{unit}</p>
    </div>
  );
}
