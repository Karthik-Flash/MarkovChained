import { cn } from "@/lib/utils";
import { MoveRight } from "lucide-react";
import type { DashboardSnapshot } from "@/types";

interface StatusBarProps {
  snapshots: DashboardSnapshot[];
  selectedCorridorId: number;
  onSelectCorridor: (id: number) => void;
}

export function StatusBar({ snapshots, selectedCorridorId, onSelectCorridor }: StatusBarProps) {
  return (
    <footer className="fixed bottom-0 left-0 right-0 z-30 h-[60px] border-t border-primary-muted bg-black/55 px-2 backdrop-blur-xl">
      <div className="flex h-full items-center gap-2 overflow-x-auto">
        {snapshots.map((snapshot) => {
          const highRisk = snapshot.congestionLevel.toLowerCase() === "high";
          return (
            <button
              key={snapshot.corridor.id}
              onClick={() => onSelectCorridor(snapshot.corridor.id)}
              className={cn(
                "min-w-[170px] rounded-lg border px-3 py-1.5 text-left transition",
                selectedCorridorId === snapshot.corridor.id
                  ? "border-primary-light bg-primary-dim"
                  : "border-primary-muted bg-black/20 hover:border-primary-light",
              )}
            >
              <p className="flex items-center gap-1 truncate text-xs font-semibold">
                <span>{snapshot.corridor.origin}</span>
                <MoveRight className="size-3.5 shrink-0" />
                <span>{snapshot.corridor.destination}</span>
              </p>
              <div className="mt-1 flex items-center justify-between text-[11px]">
                <span className={cn(highRisk ? "text-amber-200" : "text-emerald-200")}>
                  {snapshot.actionDisplay}
                </span>
                <span className="opacity-70">{Math.round(snapshot.confidence * 100)}%</span>
              </div>
            </button>
          );
        })}
      </div>
    </footer>
  );
}
