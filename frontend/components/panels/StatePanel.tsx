import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { InferenceResponse } from "@/types";

interface StatePanelProps {
  inference?: InferenceResponse;
}

export function StatePanel({ inference }: StatePanelProps) {
  const qEntries = Object.entries(inference?.q_values ?? {});

  return (
    <Card className="space-y-4 rounded-2xl border border-primary-muted bg-card/70 p-4 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-sm uppercase tracking-[0.2em] opacity-85">State Vector</h3>
        <Badge className="badge-primary">{inference?.state.index ?? "--"}</Badge>
      </div>

      <div className="rounded-lg border border-primary-muted bg-black-primary p-3">
        <p className="text-xs uppercase tracking-[0.15em] opacity-70">Policy Confidence</p>
        <p className="mt-1 font-mono text-2xl">{((inference?.confidence ?? 0) * 100).toFixed(1)}%</p>
        <Progress className="mt-2 h-2 bg-primary-light/10" value={(inference?.confidence ?? 0) * 100} />
      </div>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.15em] opacity-70">Q-values</p>
        {qEntries.length === 0 && <p className="text-sm opacity-60">No Q-table values available yet.</p>}
        {qEntries.map(([label, value]) => {
          const normalized = Math.max(0, Math.min(100, value));
          return (
            <div key={label}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span>{label}</span>
                <span className="font-mono">{value.toFixed(2)}</span>
              </div>
              <Progress className="h-1.5 bg-primary-light/10" value={normalized} />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
