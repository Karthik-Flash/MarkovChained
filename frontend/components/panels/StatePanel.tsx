import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { InferenceResponse } from "@/types";

interface StatePanelProps {
  inference?: InferenceResponse;
}

export function StatePanel({ inference }: StatePanelProps) {
  const confidencePct = (inference?.confidence ?? 0) * 100;
  const isLowConfidence = confidencePct < 98;
  const qEntries = Object.entries(inference?.q_values ?? {});
  const rankedEntries = [...qEntries].sort((a, b) => b[1] - a[1]);
  const topValue = rankedEntries[0]?.[1] ?? 0;
  const bottomValue = rankedEntries[rankedEntries.length - 1]?.[1] ?? 0;
  const qSpread = topValue - bottomValue;

  const formatActionLabel = (label: string) =>
    label
      .replace(/_/g, " ")
      .replace(/\b\w/g, (match) => match.toUpperCase());

  return (
    <Card className="gap-3 rounded-2xl border border-primary-muted bg-card/70 p-4 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-sm uppercase tracking-[0.2em] opacity-85">State Vector</h3>
      </div>



      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.15em] opacity-70">Q-values</p>
        <p className="text-xs opacity-65">Higher score wins in this state. Values can be negative.</p>
        {rankedEntries.length === 0 && <p className="text-sm opacity-60">No Q-table values available yet.</p>}
        {rankedEntries.map(([label, value], index) => {
          const normalized = qSpread > 0 ? ((value - bottomValue) / qSpread) * 100 : 100;
          const marginFromBest = value - topValue;
          const prettyLabel = formatActionLabel(label);

          return (
            <div key={label} className="rounded-md border border-primary-muted/40 bg-black-primary/70 px-2 py-2">
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span>{prettyLabel}</span>
                  {index === 0 && <Badge className="badge-primary text-[10px]">Best</Badge>}
                </div>
                <span className="font-mono">{value.toFixed(2)}</span>
              </div>
              <div className="mb-1 flex items-center justify-between text-[11px] opacity-70">
                <span>Rank #{index + 1}</span>
                <span className="font-mono">{index === 0 ? "Top" : `${marginFromBest.toFixed(2)} vs best`}</span>
              </div>
              <Progress className="h-1.5 bg-primary-light/10" value={normalized} />
            </div>
          );
        })}
      </div>
      <div className="rounded-lg border border-primary-muted bg-black-primary px-3 py-3">
        <div className="flex items-center justify-between text-[11px]">
          <p className="uppercase tracking-[0.15em] opacity-70">Policy Confidence</p>
          <p className="font-mono text-sm">{confidencePct.toFixed(1)}%</p>
        </div>
        <Progress className="mt-1 h-1 bg-primary-light/10" value={confidencePct} />
        {isLowConfidence && (
          <p className="mt-2 rounded border border-red-400/50 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-200">
            Confidence below 98%, human intervention required
          </p>
        )}
      </div>
    </Card>
  );
}
