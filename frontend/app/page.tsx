"use client";

import { CircleHelp, DollarSign, Flame, Leaf } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertBanner } from "@/components/layout/AlertBanner";
import { Navbar } from "@/components/layout/Navbar";
import { ControlTowerMap } from "@/components/map/ControlTowerMap";
import { ActionCard } from "@/components/panels/ActionCard";
import { CorridorTabs } from "@/components/panels/CorridorTabs";
import { StatePanel } from "@/components/panels/StatePanel";
import { WeatherWidget } from "@/components/panels/WeatherWidget";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { inferCorridor, readMetadata } from "@/lib/api";
import {
  corridorFromBackend,
  DEFAULT_WEATHER_RAW,
  FALLBACK_CORRIDORS,
} from "@/lib/constants";
import type { CorridorDefinition, DashboardDataMap, MetadataResponse, RouteViewMode, ShipType, TransportMode } from "@/types";

interface FormulaInfoProps {
  heading: string;
  formula: string;
  terms: string[];
  note?: string;
}

function FormulaInfo({ heading, formula, terms, note }: FormulaInfoProps) {
  return (
    <Popover>
      <PopoverTrigger className="cursor-pointer rounded-full border border-primary-muted text-primary-light/80 transition hover:text-primary-light">
        <CircleHelp className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-85 rounded-xl border-primary-muted bg-black/92 p-3 text-xs text-slate-200 shadow-[0_12px_28px_rgba(0,0,0,0.55)] backdrop-blur-lg">
        <p className="font-heading text-[11px] uppercase tracking-[0.14em] text-slate-300">{heading}</p>
        <p className="mt-2 font-mono text-[14px] leading-relaxed text-slate-100">{formula}</p>
        <div className="mt-2 space-y-1.5">
          {terms.map((term) => (
            <p key={term} className="leading-relaxed opacity-85">• {term}</p>
          ))}
        </div>
        {note ? <p className="mt-2 opacity-80">{note}</p> : null}
      </PopoverContent>
    </Popover>
  );
}

export default function Home() {
  const [mode, setMode] = useState<TransportMode>("SEA");
  const [routeViewMode, setRouteViewMode] = useState<RouteViewMode>("Markov Chained");
  const [corridors, setCorridors] = useState<CorridorDefinition[]>(FALLBACK_CORRIDORS);
  const [selectedCorridorId, setSelectedCorridorId] = useState<number>(FALLBACK_CORRIDORS[0].id);
  const [metadata, setMetadata] = useState<MetadataResponse | null>(null);
  const [dataMap, setDataMap] = useState<DashboardDataMap>({});
  const [shipType, setShipType] = useState<ShipType>("small");
  const [cargoWeightTonnes, setCargoWeightTonnes] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const corridorsFromMetadata = useMemo<CorridorDefinition[]>(() => {
    const backendCorridors = routeViewMode === "Markov Chained"
      ? metadata?.corridors_markov_focus
      : metadata?.corridors_network_all;

    const mapped = (backendCorridors ?? [])
      .slice()
      .sort((a, b) => a.corridor_id - b.corridor_id)
      .map(corridorFromBackend);

    return mapped.length > 0 ? mapped : FALLBACK_CORRIDORS;
  }, [metadata, routeViewMode]);

  const selectedCorridor = useMemo<CorridorDefinition>(() => {
    return corridors.find((corridor) => corridor.id === selectedCorridorId) ?? corridors[0] ?? FALLBACK_CORRIDORS[0];
  }, [corridors, selectedCorridorId]);
  const isNetworkMode = routeViewMode === "DP World Network";

  const selectedData = dataMap[selectedCorridor.id];

  useEffect(() => {
    if (!corridors.some((corridor) => corridor.id === selectedCorridorId)) {
      setSelectedCorridorId(corridors[0]?.id ?? FALLBACK_CORRIDORS[0].id);
    }
  }, [corridors, selectedCorridorId]);

  useEffect(() => {
    setCorridors(corridorsFromMetadata);
  }, [corridorsFromMetadata]);

  const weatherForCorridor = useCallback(
    (corridorId: number) => {
      const fromMetadata = metadata?.latest_weather_by_corridor?.[corridorId]?.weather_severity_raw;
      if (typeof fromMetadata === "number") {
        return fromMetadata;
      }
      return DEFAULT_WEATHER_RAW[corridorId] ?? 0.5;
    },
    [metadata],
  );

  const refreshData = useCallback(
    async () => {
      setError("");
      try {
        const weatherRaw = weatherForCorridor(selectedCorridor.id);
        const response = await inferCorridor({
          corridorName: selectedCorridor.name,
          transportMode: mode,
          shipType,
          cargoWeightMt: cargoWeightTonnes,
        });

        setDataMap({
          [selectedCorridor.id]: {
            inference: response,
            observedWeatherRaw: weatherRaw,
          },
        });
        setLastUpdated(new Date().toISOString());
      } catch (refreshError) {
        const message = refreshError instanceof Error ? refreshError.message : "Failed to refresh dashboard";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [cargoWeightTonnes, mode, selectedCorridor.id, selectedCorridor.name, shipType, weatherForCorridor],
  );

  useEffect(() => {
    let alive = true;

    const loadMetadata = async () => {
      setLoading(true);
      setError("");
      try {
        const metadataResponse = await readMetadata();
        if (alive) {
          setMetadata(metadataResponse);
        }
      } catch {
        if (alive) {
          setMetadata(null);
          setCorridors(FALLBACK_CORRIDORS);
        }
      }
    };

    void loadMetadata();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  useEffect(() => {
    if (mode === "AIR") {
      document.documentElement.setAttribute("data-theme", "air");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }, [mode]);

  return (
    <div className="flex min-h-screen flex-col bg-hud-noise text-foreground">
      <Navbar
        activeMode={mode}
        onChangeMode={setMode}
        lastUpdated={lastUpdated}
      />

      <main className={`grid min-h-0 flex-1 grid-cols-1 gap-3 px-3 pb-3 pt-3 ${isNetworkMode ? "lg:grid-cols-[360px_minmax(0,1fr)]" : "lg:grid-cols-[360px_minmax(0,1fr)_360px]"}`}>
        <section className="space-y-3">
          <CorridorTabs
            corridors={corridors}
            selectedCorridorId={selectedCorridorId}
            onSelectCorridor={setSelectedCorridorId}
            mode={mode}
            routeViewMode={routeViewMode}
            onChangeRouteViewMode={setRouteViewMode}
            shipType={shipType}
            onChangeShipType={setShipType}
            cargoWeightTonnes={cargoWeightTonnes}
            onChangeCargoWeightTonnes={setCargoWeightTonnes}
          />
          {!isNetworkMode && (
            <StatePanel
              inference={selectedData?.inference}
            />
          )}
        </section>

        <section className="relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-primary-muted bg-card/70 p-3 backdrop-blur-xl">
          {!isNetworkMode && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
              <AlertBanner
                loading={loading}
                error={error}
                alertReason={selectedData?.inference.alert_reason ?? "No active alert"}
                congestionLevel={selectedData?.inference.congestion_level}
              />
              <WeatherWidget
                compact
                state={selectedData?.inference.state.weather}
                windKmh={selectedData?.inference.wind_kmh}
                visibility={selectedData?.inference.visibility}
                weatherRaw={selectedData?.observedWeatherRaw}
              />
            </div>
          )}
          <div className={`${isNetworkMode ? "mt-0" : "mt-3"} min-h-0 flex-1 overflow-hidden rounded-xl border border-primary-muted`}>
            <ControlTowerMap
              corridors={corridors}
              selectedCorridorId={selectedCorridor.id}
              dataMap={dataMap}
              routeViewMode={routeViewMode}
            />
          </div>
        </section>

        {!isNetworkMode && (
        <section className="space-y-3">
          <ActionCard
            action={selectedData?.inference.action}
            loading={loading}
          />

          <div className="grid grid-cols-1 gap-3">
            <div className="rounded-2xl border border-primary-muted bg-card/70 p-4 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] opacity-70">
                  <Flame className="size-3.5" />
                  Fuel Usage
                </p>
                <FormulaInfo
                  heading="Fuel Consumed Formula"
                  formula="Fuel_consumed = distance_nm * cargo_mt * FC_CONST * (speed / V_ref)^3"
                  terms={[
                    "distance_nm: distance traveled in nautical miles",
                    "cargo_mt: cargo carried in metric tons",
                    "FC_CONST: fuel consumption constant",
                    "V_ref: baseline reference speed",
                  ]}
                />
              </div>
              <p className="mt-1 font-mono text-2xl font-semibold text-teal-300 whitespace-normal break-all">
                {(selectedData?.inference.fuel_mt ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT
              </p>
              <p className="mt-2 text-[11px] opacity-65">Estimated voyage fuel burn</p>
            </div>

            <div className="rounded-2xl border border-primary-muted bg-card/70 p-4 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] opacity-70">
                  <DollarSign className="size-3.5" />
                  Fuel Economics
                </p>
                <FormulaInfo
                  heading="Fuel Cost and Saved"
                  formula="Fuel_cost = fuel_consumed_mt * P_fuel"
                  terms={[
                    "fuel_consumed_mt: fuel from the consumed-fuel formula",
                    "P_fuel: fuel price per metric ton",
                    "Fuel_saved_mt = Fuel_baseline_mt - Fuel_consumed_mt",
                  ]}
                />
              </div>
              <div className="mt-1 flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-2xl font-semibold text-sky-300 whitespace-normal break-all">
                    ${(selectedData?.inference.fuel_cost_usd ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-[11px] opacity-70">fuel cost</p>
                </div>
                <div className="min-w-0 text-right">
                  <p className="font-mono text-base font-semibold text-emerald-300 whitespace-normal break-all">
                    +${(selectedData?.inference.cost_saved_usd ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-[11px] opacity-70">cost saved</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-400/35 bg-emerald-500/10 p-4 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] opacity-70">
                  <Leaf className="size-3.5" />
                  Emissions
                </p>
                <FormulaInfo
                  heading="CO2 Emitted Formula"
                  formula="CO2_emitted = distance_nm * cargo_mt * FC_CONST * (speed / V_ref)^3"
                  terms={[
                    "distance_nm: distance traveled in nautical miles",
                    "cargo_mt: cargo carried in metric tons",
                    "FC_CONST: fuel/emission constant",
                    "(speed / V_ref)^3: cubic speed impact",
                  ]}
                />
              </div>
              <div className="mt-1 flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-2xl font-semibold text-emerald-200 whitespace-normal break-all">
                    {(selectedData?.inference.co2_tco2 ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-[11px] opacity-70">tCO2 total</p>
                </div>
                <div className="min-w-0 text-right">
                  <p className="font-mono text-base font-semibold text-emerald-300 whitespace-normal break-all">
                    +{(selectedData?.inference.carbon_saved_tco2 ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-[11px] opacity-70">tCO2 saved</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-primary-muted bg-card/70 p-4 backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-heading text-sm uppercase tracking-[0.22em] text-primary-light opacity-80">Live Headlines</h2>
              <span className="text-xs opacity-60">External Sources</span>
            </div>
            <div className="space-y-3">
              {(selectedData?.inference.headlines ?? []).length === 0 && (
                <p className="rounded-lg border border-primary-muted bg-black-primary p-3 text-sm text-primary-light opacity-70">
                  No external headlines have been pushed for this corridor yet.
                </p>
              )}
              {(selectedData?.inference.headlines ?? []).map((item, index) => (
                <a
                  key={`${item.title}-${index}`}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-lg border border-primary-muted bg-black-primary p-3 transition hover:border-primary-light hover:bg-black/35"
                >
                  <p className="text-sm font-medium">{item.title}</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-primary-light opacity-70">
                    <span>{item.source}</span>
                    <span>risk {item.risk_score.toFixed(2)}</span>
                  </div>
                </a>
              ))}
            </div>
          </div>

        </section>
        )}
      </main>
    </div>
  );
}
