import { AlertCircle, Zap } from "lucide-react";

interface ActionCardProps {
  action?: string;
  loading?: boolean;
}

export function ActionCard({ action, loading }: ActionCardProps) {
  const actionDisplay = loading ? "Computing..." : action ?? "No Action";
  const isHighPriority =
    action?.toLowerCase().includes("reroute") || action?.toLowerCase().includes("slow");

  return (
    <div
      className={`rounded-2xl border p-4 backdrop-blur-xl ${
        isHighPriority
          ? "border-destructive/50 bg-destructive/10"
          : "border-primary-muted bg-card/70"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs uppercase tracking-[0.15em] opacity-70">Recommended Action</p>
          <p className="mt-2 text-lg font-semibold">{actionDisplay}</p>
        </div>
        {isHighPriority ? (
          <AlertCircle className="size-5 shrink-0 text-destructive/70" />
        ) : (
          <Zap className="size-5 shrink-0 text-primary-light opacity-70" />
        )}
      </div>
    </div>
  );
}
