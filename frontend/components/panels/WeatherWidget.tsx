import { Cloud, CloudRain, Wind } from "lucide-react";
import { cn } from "@/lib/utils";

interface WeatherWidgetProps {
  state?: string;
  windKmh?: number;
  visibility?: string;
  weatherRaw?: number;
  compact?: boolean;
  className?: string;
}

export function WeatherWidget({ state, windKmh, visibility, weatherRaw, compact = false, className }: WeatherWidgetProps) {
  const weatherPercentage = Math.round((weatherRaw ?? 0) * 100);
  
  const getWeatherIcon = () => {
    if (!state) return <Cloud className="size-8" />;
    const lowerState = state.toLowerCase();
    if (lowerState.includes("storm") || lowerState.includes("heavy")) {
      return <CloudRain className="size-8" />;
    }
    if (lowerState.includes("rain") || lowerState.includes("wind")) {
      return <Wind className="size-8" />;
    }
    return <Cloud className="size-8" />;
  };

  if (compact) {
    return (
      <div className={cn("rounded-2xl border border-primary-muted bg-card/70 p-2.5 backdrop-blur-xl", className)}>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-dim/80 opacity-80">
            {getWeatherIcon()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="truncate opacity-75">{state ?? "Unknown"}</span>
              <span className="font-mono">{weatherPercentage}%</span>
            </div>
            <div className="mt-1 h-1 rounded-full bg-primary-light/10 overflow-hidden">
              <div
                className="h-full bg-linear-to-r from-primary-light to-primary"
                style={{ width: `${weatherPercentage}%` }}
              />
            </div>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-md bg-black/20 px-2 py-1">
            <span className="opacity-65">Wind </span>
            <span className="font-mono">{windKmh?.toFixed(1) ?? "--"} km/h</span>
          </div>
          <div className="rounded-md bg-black/20 px-2 py-1">
            <span className="opacity-65">Visibility </span>
            <span className="font-mono">{visibility ?? "--"}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-2xl border border-primary-muted bg-card/70 p-4 backdrop-blur-xl", className)}>
      <h3 className="mb-4 text-xs uppercase tracking-[0.15em] opacity-70">Weather Conditions</h3>

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-dim opacity-70">
            {getWeatherIcon()}
          </div>
          <div>
            <p className="text-xs opacity-70">Current State</p>
            <p className="font-semibold text-base">{state ?? "Unknown"}</p>
          </div>
        </div>

        <div className="space-y-2">
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="opacity-70">Severity</span>
              <span className="font-mono">{weatherPercentage}%</span>
            </div>
            <div className="rounded-full bg-primary-light/10 overflow-hidden h-2">
              <div
                className="h-full bg-linear-to-r from-primary-light to-primary"
                style={{ width: `${weatherPercentage}%` }}
              />
            </div>
          </div>
        </div>

        <div className="text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="opacity-70">Wind Speed</span>
            <span className="font-mono">{windKmh?.toFixed(1) ?? "--"} km/h</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="opacity-70">Visibility</span>
            <span className="font-mono">{visibility ?? "--"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
