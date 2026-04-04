import { useEffect, useState } from "react";
import { MoveRight } from "lucide-react";
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
import type { CorridorDefinition, RouteViewMode, ShipType, TransportMode } from "@/types";

const ROUTE_VIEW_OPTIONS = ["DP World Network", "Markov Chained"] as const;

interface CorridorTabsProps {
  corridors: CorridorDefinition[];
  selectedCorridorId: number;
  onSelectCorridor: (id: number) => void;
  mode: TransportMode;
  routeViewMode: RouteViewMode;
  onChangeRouteViewMode: (mode: RouteViewMode) => void;
  shipType: ShipType;
  onChangeShipType: (value: ShipType) => void;
  cargoWeightTonnes: number;
  onChangeCargoWeightTonnes: (value: number) => void;
}

const SHIP_TYPE_OPTIONS: Array<{ value: ShipType; label: string; legacyLabel: string; lwt: number; maxCargo: number }> = [
  { value: "small", label: "Mini-Bulk", legacyLabel: "Small", lwt: 2500, maxCargo: 5600 },
  { value: "medium", label: "Handysize", legacyLabel: "Medium", lwt: 10000, maxCargo: 30000 },
  { value: "large", label: "Capesize", legacyLabel: "Large", lwt: 25000, maxCargo: 96000 },
];

const MIN_CARGO_WEIGHT_TONNES = 0;
const CARGO_WEIGHT_DEBOUNCE_MS = 400;

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

function maxCargoForShip(shipType: ShipType): number {
  return SHIP_TYPE_OPTIONS.find((option) => option.value === shipType)?.maxCargo ?? 5600;
}

function validateCargoWeight(rawValue: string, shipType: ShipType): { parsed?: number; error: string } {
  const maxCargo = maxCargoForShip(shipType);

  if (!/^\d*\.?\d*$/.test(rawValue)) {
    return { error: "Use numbers only." };
  }

  if (rawValue.length === 0 || rawValue === ".") {
    return {
      error: `Enter a value between ${MIN_CARGO_WEIGHT_TONNES} and ${formatWithCommas(String(maxCargo))} MT.`,
    };
  }

  const parsed = Number.parseFloat(rawValue);
  if (Number.isNaN(parsed)) {
    return { error: "Enter a valid number." };
  }

  if (parsed < MIN_CARGO_WEIGHT_TONNES || parsed > maxCargo) {
    return {
      error: `Value must be ${MIN_CARGO_WEIGHT_TONNES}-${formatWithCommas(String(maxCargo))} MT.`,
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
  shipType,
  onChangeShipType,
  cargoWeightTonnes,
  onChangeCargoWeightTonnes,
}: CorridorTabsProps) {
  const selectedCorridor = corridors.find((corridor) => corridor.id === selectedCorridorId) ?? corridors[0];
  const [cargoInput, setCargoInput] = useState(String(cargoWeightTonnes));
  const [cargoError, setCargoError] = useState<string>("");

  useEffect(() => {
    setCargoInput(String(cargoWeightTonnes));
  }, [cargoWeightTonnes]);

  useEffect(() => {
    const { parsed, error } = validateCargoWeight(cargoInput, shipType);
    setCargoError(error);

    if (error || parsed === undefined) {
      return;
    }

    const timer = setTimeout(() => {
      if (parsed !== cargoWeightTonnes) {
        onChangeCargoWeightTonnes(parsed);
      }
    }, CARGO_WEIGHT_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [cargoInput, cargoWeightTonnes, shipType, onChangeCargoWeightTonnes]);

  const origins = Array.from(new Set(corridors.map((corridor) => corridor.origin))).sort();

  const validDestinations = Array.from(
    new Set(
      corridors
        .filter((corridor) => corridor.origin === selectedCorridor.origin)
        .map((corridor) => corridor.destination),
    ),
  ).sort();

  const selectedShipOption = SHIP_TYPE_OPTIONS.find((option) => option.value === shipType) ?? SHIP_TYPE_OPTIONS[0];

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

  const onChangeCargoWeight = (rawValue: string) => {
    const normalizedRawValue = rawValue.replaceAll(",", "");
    setCargoInput(normalizedRawValue);
    const { error } = validateCargoWeight(normalizedRawValue, shipType);
    setCargoError(error);
  };

  const onChangeShipTypeValue = (value: string) => {
    const nextShipType = value as ShipType;
    onChangeShipType(nextShipType);

    const maxCargo = maxCargoForShip(nextShipType);
    const parsedCurrent = Number.parseFloat(cargoInput);
    if (!Number.isNaN(parsedCurrent) && parsedCurrent > maxCargo) {
      setCargoInput(String(maxCargo));
      onChangeCargoWeightTonnes(maxCargo);
      setCargoError("");
    }
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
                Corridor
              </label>
              <div className="grid grid-cols-[minmax(0,1fr)_22px_minmax(0,1fr)] items-center gap-1">
                <Select
                  value={selectedCorridor.origin}
                  onValueChange={(value) => onChangeOrigin(value)}
                >
                  <SelectTrigger className="h-11 w-full border-primary-muted bg-black/25 px-3 focus:border-primary-light focus:ring-primary-light/20">
                    <SelectValue placeholder="Origin" />
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

                <div className="flex h-11 items-center justify-center">
                  <MoveRight className="size-4 opacity-70" />
                </div>

                <Select
                  value={selectedCorridor.destination}
                  onValueChange={(value) => onChangeDestination(value)}
                >
                  <SelectTrigger className="h-11 w-full border-primary-muted bg-black/25 px-3 focus:border-primary-light focus:ring-primary-light/20">
                    <SelectValue placeholder="Destination" />
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
            </div>

            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-[0.14em] opacity-70">
                Ship Type
              </label>
              <Select value={shipType} onValueChange={onChangeShipTypeValue}>
                <SelectTrigger className="h-12! w-full border-primary-muted bg-black/25 px-3 py-2 focus:border-primary-light focus:ring-primary-light/20">
                  <div className="flex w-full flex-col items-start gap-0.5 leading-tight">
                    <span>{selectedShipOption.label}</span>
                    <div className="flex w-full items-center justify-between text-[11px] opacity-65">
                      <span>LWT {formatWithCommas(String(selectedShipOption.lwt))} MT</span>
                    </div>
                  </div>
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  side="bottom"
                  align="start"
                  sideOffset={6}
                  className="border-primary-muted bg-slate-900 p-1.5"
                >
                  {SHIP_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="min-h-12 px-3 py-2 w-full">
                      <div className="flex w-full flex-col leading-tight">
                        <span>{option.label}</span>
                        <div className="flex w-full items-end justify-between text-[11px] opacity-65 gap-1">
                          <span>LWT {formatWithCommas(String(option.lwt))} MT</span>
                          <span className="font-medium opacity-80">({option.legacyLabel})</span>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label htmlFor="transport-weight-tonnes" className="mb-1 block text-[11px] uppercase tracking-[0.14em] opacity-70">
                Cargo Weight (MT)
              </label>
              <Input
                id="transport-weight-tonnes"
                inputMode="decimal"
                pattern="[0-9]*[.]?[0-9]*"
                value={formatWithCommas(cargoInput)}
                onChange={(event) => onChangeCargoWeight(event.target.value)}
                className="h-11 border-primary-muted bg-black/25 px-3 focus-visible:border-primary-light focus-visible:ring-primary-light/20"
                aria-invalid={cargoError.length > 0}
                aria-describedby="transport-weight-hint"
              />
              <p id="transport-weight-hint" className={`mt-1 text-xs ${cargoError ? "text-amber-300" : "opacity-65"}`}>
                {cargoError || `Allowed range: ${MIN_CARGO_WEIGHT_TONNES} to ${formatWithCommas(String(maxCargoForShip(shipType)))} MT.`}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
