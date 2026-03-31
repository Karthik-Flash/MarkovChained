import { Cloud, CloudRain, Wind } from "lucide-react";
import { cn } from "@/lib/utils";

interface WeatherWidgetProps {
  state?: string;
  windKmh?: number;
  visibility?: string;
  weatherRaw?: number;
}

export function WeatherWidget({ state, windKmh, visibility, weatherRaw }: WeatherWidgetProps) {
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

  return (
    <div className="rounded-2xl border border-primary-muted bg-card/70 p-4 backdrop-blur-xl">
      <h3 className="mb-4 text-xs uppercase tracking-[0.15em] opacity-70">Weather Conditions</h3>
      
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-dim opacity-70">
            {getWeatherIcon()}
          </div>
          <div>
            <p className="text-xs opacity-70">Current State</p>
            <p className="font-semibold">{state ?? "Unknown"}</p>
          </div>
        </div>

        <div className="space-y-2">
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="opacity-70">Severity</span>
              <span className="font-mono">{weatherPercentage}%</span>
            </div>
            <div className="h-2 rounded-full bg-primary-light/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary-light to-primary"
                style={{ width: `${weatherPercentage}%` }}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2 text-xs">
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
