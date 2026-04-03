"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertBanner } from "@/components/layout/AlertBanner";
import { Navbar } from "@/components/layout/Navbar";
import { ControlTowerMap } from "@/components/map/ControlTowerMap";
import { ActionCard } from "@/components/panels/ActionCard";
import { CorridorTabs } from "@/components/panels/CorridorTabs";
import { MetricCard } from "@/components/panels/MetricCard";
import { StatePanel } from "@/components/panels/StatePanel";
import { WeatherWidget } from "@/components/panels/WeatherWidget";
import { inferCorridor, readCorridors, readMetadata } from "@/lib/api";
import {
  corridorFromBackend,
  DEFAULT_WEATHER_RAW,
  FALLBACK_CORRIDORS,
} from "@/lib/constants";
import type { CorridorDefinition, DashboardDataMap, MetadataResponse, RouteViewMode, TransportMode } from "@/types";

export default function Home() {
  const [mode, setMode] = useState<TransportMode>("SEA");
  const [routeViewMode, setRouteViewMode] = useState<RouteViewMode>("Markov Chained");
  const [corridors, setCorridors] = useState<CorridorDefinition[]>(FALLBACK_CORRIDORS);
  const [selectedCorridorId, setSelectedCorridorId] = useState<number>(FALLBACK_CORRIDORS[0].id);
  const [metadata, setMetadata] = useState<MetadataResponse | null>(null);
  const [dataMap, setDataMap] = useState<DashboardDataMap>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const selectedCorridor = useMemo<CorridorDefinition>(() => {
    return corridors.find((corridor) => corridor.id === selectedCorridorId) ?? corridors[0] ?? FALLBACK_CORRIDORS[0];
  }, [corridors, selectedCorridorId]);

  const selectedData = dataMap[selectedCorridor.id];

  useEffect(() => {
    if (!corridors.some((corridor) => corridor.id === selectedCorridorId)) {
      setSelectedCorridorId(corridors[0]?.id ?? FALLBACK_CORRIDORS[0].id);
    }
  }, [corridors, selectedCorridorId]);

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
      setRefreshing(true);
      setError("");
      try {
        const inferResults = await Promise.all(
          corridors.map(async (corridor) => {
            const weatherRaw = weatherForCorridor(corridor.id);
            const response = await inferCorridor({
              corridorName: corridor.name,
              transportMode: mode,
            });

            return [corridor.id, { inference: response, observedWeatherRaw: weatherRaw }] as const;
          }),
        );

        const mapped: DashboardDataMap = Object.fromEntries(inferResults);
        setDataMap(mapped);
        setLastUpdated(new Date().toISOString());
      } catch (refreshError) {
        const message = refreshError instanceof Error ? refreshError.message : "Failed to refresh dashboard";
        setError(message);
      } finally {
        setRefreshing(false);
        setLoading(false);
      }
    },
    [corridors, mode, weatherForCorridor],
  );

  useEffect(() => {
    let alive = true;

    const loadMetadata = async () => {
      setLoading(true);
      setError("");
      try {
        const [metadataResponse, corridorsResponse] = await Promise.all([readMetadata(), readCorridors()]);
        const fetchedCorridors = corridorsResponse.corridors
          .slice()
          .sort((a, b) => a.corridor_id - b.corridor_id)
          .map(corridorFromBackend);

        if (alive) {
          setMetadata(metadataResponse);
          setCorridors(fetchedCorridors.length > 0 ? fetchedCorridors : FALLBACK_CORRIDORS);
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
        onRefresh={refreshData}
        refreshing={refreshing}
        lastUpdated={lastUpdated}
      />

      <main className="grid flex-1 grid-cols-1 gap-3 px-3 pb-3 pt-3 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        <section className="space-y-3">
          <CorridorTabs
            corridors={corridors}
            selectedCorridorId={selectedCorridorId}
            onSelectCorridor={setSelectedCorridorId}
            mode={mode}
            dataMap={dataMap}
            routeViewMode={routeViewMode}
            onChangeRouteViewMode={setRouteViewMode}
          />
          <StatePanel
            inference={selectedData?.inference}
          />
          <WeatherWidget
            state={selectedData?.inference.state.weather}
            windKmh={selectedData?.inference.wind_kmh}
            visibility={selectedData?.inference.visibility}
            weatherRaw={selectedData?.observedWeatherRaw}
          />
        </section>

        <section className="relative overflow-hidden rounded-2xl border border-primary-muted bg-card/70 p-3 backdrop-blur-xl">
          <AlertBanner
            loading={loading}
            error={error}
            alertReason={selectedData?.inference.alert_reason ?? "No active alert"}
            congestionLevel={selectedData?.inference.congestion_level}
          />
          <div className="mt-3 h-[56vh] min-h-[380px] overflow-hidden rounded-xl border border-primary-muted lg:h-[calc(100vh-230px)]">
            <ControlTowerMap
              corridors={corridors}
              selectedCorridorId={selectedCorridor.id}
              dataMap={dataMap}
              routeViewMode={routeViewMode}
            />
          </div>
        </section>

        <section className="space-y-3">
          <ActionCard
            action={selectedData?.inference.action}
            loading={loading}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <MetricCard
              label="Delay Saved"
              value={selectedData?.inference.delay_saved_hours ?? 0}
              unit="hours"
              tone="teal"
            />
            <MetricCard
              label="Cost Saved"
              value={selectedData?.inference.cost_saved_usd ?? 0}
              unit="USD"
              tone="blue"
              currency
            />
            <MetricCard
              label="Carbon Saved"
              value={selectedData?.inference.carbon_saved_tco2 ?? 0}
              unit="tCO2"
              tone="amber"
            />
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
      </main>
    </div>
  );
}
