import { AlertTriangle, CircleAlert, Radar } from "lucide-react";
import { cn } from "@/lib/utils";

interface AlertBannerProps {
  loading: boolean;
  error: string;
  alertReason: string;
  congestionLevel?: string;
}

export function AlertBanner({ loading, error, alertReason, congestionLevel }: AlertBannerProps) {
  const isHigh = congestionLevel?.toLowerCase() === "high";

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3 text-sm alert-banner-default",
        error
          ? "border-rose-300/50 bg-rose-500/15 text-rose-100"
          : isHigh
            ? "border-amber-300/50 bg-amber-500/15 text-amber-100"
            : "",
      )}
    >
      {error ? (
        <CircleAlert className="size-5 shrink-0" />
      ) : isHigh ? (
        <AlertTriangle className="size-5 shrink-0" />
      ) : (
        <Radar className="size-5 shrink-0" />
      )}
      <div>
        <p className="font-semibold uppercase tracking-[0.15em]">Control Alert</p>
        <p className="text-sm opacity-90">{loading ? "Computing latest route policy..." : error || alertReason}</p>
      </div>
    </div>
  );
}
