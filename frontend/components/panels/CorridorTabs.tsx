import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import type { CorridorDefinition, RouteViewMode, TransportMode } from "@/types";

const ROUTE_VIEW_OPTIONS = ["DP World Network", "Markov Chained"] as const;

interface CorridorTabsProps {
  corridors: CorridorDefinition[];
  selectedCorridorId: number;
  onSelectCorridor: (id: number) => void;
  mode: TransportMode;
  routeViewMode: RouteViewMode;
  onChangeRouteViewMode: (mode: RouteViewMode) => void;
  transportWeightTonnes: number;
  onChangeTransportWeightTonnes: (value: number) => void;
}

const MIN_TRANSPORT_WEIGHT_TONNES = 1;
const MAX_TRANSPORT_WEIGHT_TONNES = 300000;
const TRANSPORT_WEIGHT_DEBOUNCE_MS = 400;

function formatWithCommas(rawDigits: string): string {
  if (!rawDigits) {
    return "";
  }

  const hasDecimalPoint = rawDigits.includes(".");
  const [wholePart, fractionPart = ""] = rawDigits.split(".");
  const wholePartFormatted = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  if (!hasDecimalPoint) {
    return wholePartFormatted;
  }

  return `${wholePartFormatted}.${fractionPart}`;
}

function validateTransportWeight(rawValue: string): { parsed?: number; error: string } {
  if (!/^\d*\.?\d*$/.test(rawValue)) {
    return { error: "Use numbers only." };
  }

  if (rawValue.length === 0 || rawValue === ".") {
    return {
      error: `Enter a value between ${MIN_TRANSPORT_WEIGHT_TONNES} and ${formatWithCommas(String(MAX_TRANSPORT_WEIGHT_TONNES))} tonnes.`,
    };
  }

  const parsed = Number.parseFloat(rawValue);
  if (Number.isNaN(parsed)) {
    return { error: "Enter a valid number." };
  }

  if (parsed < MIN_TRANSPORT_WEIGHT_TONNES || parsed > MAX_TRANSPORT_WEIGHT_TONNES) {
    return {
      error: `Value must be ${MIN_TRANSPORT_WEIGHT_TONNES}-${formatWithCommas(String(MAX_TRANSPORT_WEIGHT_TONNES))} tonnes.`,
    };
  }

  return { parsed, error: "" };
}

export function CorridorTabs({
  corridors,
  selectedCorridorId,
  onSelectCorridor,
  mode,
  routeViewMode,
  onChangeRouteViewMode,
  transportWeightTonnes,
  onChangeTransportWeightTonnes,
}: CorridorTabsProps) {
  const selectedCorridor = corridors.find((corridor) => corridor.id === selectedCorridorId) ?? corridors[0];
  const [weightInput, setWeightInput] = useState(String(transportWeightTonnes));
  const [weightError, setWeightError] = useState<string>("");

  useEffect(() => {
    setWeightInput(String(transportWeightTonnes));
  }, [transportWeightTonnes]);

  useEffect(() => {
    const { parsed, error } = validateTransportWeight(weightInput);
    setWeightError(error);

    if (error || parsed === undefined) {
      return;
    }

    const timer = setTimeout(() => {
      if (parsed !== transportWeightTonnes) {
        onChangeTransportWeightTonnes(parsed);
      }
    }, TRANSPORT_WEIGHT_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [weightInput, transportWeightTonnes, onChangeTransportWeightTonnes]);

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

  const onChangeTransportWeight = (rawValue: string) => {
    const normalizedRawValue = rawValue.replaceAll(",", "");
    setWeightInput(normalizedRawValue);
    const { error } = validateTransportWeight(normalizedRawValue);
    setWeightError(error);
  };

  return (
    <div className="rounded-2xl border border-primary-muted bg-card/70 p-4 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-heading text-sm uppercase tracking-[0.2em] opacity-85">Route Options</h2>
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

            <div>
              <label htmlFor="transport-weight-tonnes" className="mb-1 block text-[11px] uppercase tracking-[0.14em] opacity-70">
                Transport Weight (tonnes)
              </label>
              <Input
                id="transport-weight-tonnes"
                inputMode="decimal"
                pattern="[0-9]*[.]?[0-9]*"
                value={formatWithCommas(weightInput)}
                onChange={(event) => onChangeTransportWeight(event.target.value)}
                className="h-11 border-primary-muted bg-black/25 px-3 focus-visible:border-primary-light focus-visible:ring-primary-light/20"
                aria-invalid={weightError.length > 0}
                aria-describedby="transport-weight-hint"
              />
              <p id="transport-weight-hint" className={`mt-1 text-xs ${weightError ? "text-amber-300" : "opacity-65"}`}>
                {weightError || `Allowed range: ${MIN_TRANSPORT_WEIGHT_TONNES} to ${formatWithCommas(String(MAX_TRANSPORT_WEIGHT_TONNES))} tonnes.`}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
