import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import type { CorridorDefinition, DashboardDataMap, RouteViewMode, TransportMode } from "@/types";

const ROUTE_VIEW_OPTIONS = ["DP World Network", "Markov Chained"] as const;

interface CorridorTabsProps {
  corridors: CorridorDefinition[];
  selectedCorridorId: number;
  onSelectCorridor: (id: number) => void;
  mode: TransportMode;
  dataMap: DashboardDataMap;
  routeViewMode: RouteViewMode;
  onChangeRouteViewMode: (mode: RouteViewMode) => void;
}

export function CorridorTabs({
  corridors,
  selectedCorridorId,
  onSelectCorridor,
  mode,
  dataMap,
  routeViewMode,
  onChangeRouteViewMode,
}: CorridorTabsProps) {
  const selectedCorridor = corridors.find((corridor) => corridor.id === selectedCorridorId) ?? corridors[0];

  const origins = Array.from(new Set(corridors.map((corridor) => corridor.origin))).sort();

  const validDestinations = Array.from(
    new Set(
      corridors
        .filter((corridor) => corridor.origin === selectedCorridor.origin)
        .map((corridor) => corridor.destination),
    ),
  ).sort();

  const onChangeOrigin = (nextOrigin: string) => {
    const destinationOptions = Array.from(
      new Set(
        corridors
          .filter((corridor) => corridor.origin === nextOrigin)
          .map((corridor) => corridor.destination),
      ),
    );

    const nextDestination = destinationOptions.includes(selectedCorridor.destination)
      ? selectedCorridor.destination
      : destinationOptions[0];

    const nextCorridor = corridors.find(
      (corridor) => corridor.origin === nextOrigin && corridor.destination === nextDestination,
    );

    if (nextCorridor) {
      onSelectCorridor(nextCorridor.id);
    }
  };

  const onChangeDestination = (nextDestination: string) => {
    const originOptions = Array.from(
      new Set(
        corridors
          .filter((corridor) => corridor.destination === nextDestination)
          .map((corridor) => corridor.origin),
      ),
    );

    const nextOrigin = originOptions.includes(selectedCorridor.origin) ? selectedCorridor.origin : originOptions[0];

    const nextCorridor = corridors.find(
      (corridor) => corridor.origin === nextOrigin && corridor.destination === nextDestination,
    );

    if (nextCorridor) {
      onSelectCorridor(nextCorridor.id);
    }
  };

  return (
    <div className="rounded-2xl border border-primary-muted bg-card/70 p-4 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-heading text-sm uppercase tracking-[0.2em] opacity-85">Route Selector</h2>
        <Badge className="badge-primary">{mode}</Badge>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-[0.14em] opacity-70">
            Route View
          </label>
          <SegmentedToggle<RouteViewMode>
            options={ROUTE_VIEW_OPTIONS}
            value={routeViewMode}
            onValueChange={onChangeRouteViewMode}
            className="grid-cols-2"
          />
        </div>

        {routeViewMode === "Markov Chained" && (
          <>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-[0.14em] opacity-70">
                Origin
              </label>
              <Select
                value={selectedCorridor.origin}
                onValueChange={(value) => onChangeOrigin(value)}
              >
                <SelectTrigger className="h-11 w-full border-primary-muted bg-black/25 px-3 focus:border-primary-light focus:ring-primary-light/20">
                  <SelectValue placeholder="Select origin" />
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  side="bottom"
                  align="start"
                  sideOffset={6}
                  className="border-primary-muted bg-slate-900 p-1.5"
                >
                  {origins.map((origin) => (
                    <SelectItem key={origin} value={origin} className="min-h-9 px-3 py-2">
                      {origin}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-[0.14em] opacity-70">
                Destination
              </label>
              <Select
                value={selectedCorridor.destination}
                onValueChange={(value) => onChangeDestination(value)}
              >
                <SelectTrigger className="h-11 w-full border-primary-muted bg-black/25 px-3 focus:border-primary-light focus:ring-primary-light/20">
                  <SelectValue placeholder="Select destination" />
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  side="bottom"
                  align="start"
                  sideOffset={6}
                  className="border-primary-muted bg-slate-900 p-1.5"
                >
                  {validDestinations.map((destination) => (
                    <SelectItem key={destination} value={destination} className="min-h-9 px-3 py-2">
                      {destination}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
