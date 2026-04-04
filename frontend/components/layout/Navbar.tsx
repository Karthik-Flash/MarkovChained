"use client";

import { cn } from "@/lib/utils";
import type { TransportMode } from "@/types";

interface NavbarProps {
  activeMode: TransportMode;
  onChangeMode: (mode: TransportMode) => void;
  lastUpdated: string;
}

export function Navbar({
  activeMode,
  onChangeMode,
  lastUpdated,
}: NavbarProps) {
  const updatedLabel = lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "--:--:--";

  return (
    <header className="relative z-20 border-b border-primary-muted bg-black/35 px-3 py-3 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-heading text-xs uppercase tracking-[0.22em] opacity-70">MarkovChained</p>
          <h1 className="font-heading text-xl uppercase tracking-[0.08em]">Maritime Control Tower</h1>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-primary-muted bg-black/40 p-1">
          {(["SEA", "AIR"] as const).map((item) => (
            <button
              key={item}
              onClick={() => onChangeMode(item)}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-semibold tracking-wider transition",
                activeMode === item
                  ? "bg-[var(--primary)] text-slate-950 shadow-[0_0_16px_var(--primary),_0_0_32px_color-mix(in_srgb,_var(--primary)_40%,_transparent)]"
                  : "opacity-80 hover:opacity-100",
              )}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <p className="text-xs opacity-70 mr-4">Updated {updatedLabel}</p>
        </div>
      </div>
    </header>
  );
}
