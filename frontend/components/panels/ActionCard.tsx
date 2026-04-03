import { AlertCircle, AlertTriangle, Zap } from "lucide-react";

interface ActionCardProps {
  action?: string;
  loading?: boolean;
}

export function ActionCard({ action, loading }: ActionCardProps) {
  const actionDisplay = loading ? "Computing..." : action ?? "No Action";
  const normalizedAction = actionDisplay.toLowerCase();
  const isReroute = normalizedAction.includes("reroute");
  const isSlowSteam = normalizedAction.includes("slow steam") || normalizedAction.includes("hold at hub");

  const toneClass = isReroute
    ? "action-card-reroute"
    : isSlowSteam
      ? "action-card-slow"
      : "border-primary-muted bg-card/70";

  const icon = isReroute ? (
    <AlertCircle className="action-card-reroute-icon size-5 shrink-0" />
  ) : isSlowSteam ? (
    <AlertTriangle className="action-card-slow-icon size-5 shrink-0" />
  ) : (
    <Zap className="size-5 shrink-0 text-primary-light opacity-70" />
  );

  return (
    <div className={`rounded-2xl border p-4 backdrop-blur-xl ${toneClass}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs uppercase tracking-[0.15em] opacity-70">Recommended Action</p>
          <p className="mt-2 text-lg font-semibold">{actionDisplay}</p>
        </div>
        {icon}
      </div>
    </div>
  );
}
