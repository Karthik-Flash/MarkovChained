"use client";

import dynamic from "next/dynamic";
import type { CorridorDefinition, DashboardDataMap, RouteViewMode } from "@/types";

interface ControlTowerMapProps {
  corridors: CorridorDefinition[];
  selectedCorridorId: number;
  dataMap: DashboardDataMap;
  routeViewMode: RouteViewMode;
}

const ControlTowerMapClient = dynamic(() => import("@/components/map/ControlTowerMapClient"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-cyan-950/40" />,
});

export function ControlTowerMap({
  corridors,
  selectedCorridorId,
  dataMap,
  routeViewMode,
}: ControlTowerMapProps) {
  return (
    <ControlTowerMapClient
      corridors={corridors}
      selectedCorridorId={selectedCorridorId}
      dataMap={dataMap}
      routeViewMode={routeViewMode}
    />
  );
}
