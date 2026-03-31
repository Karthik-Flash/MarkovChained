"use client";

import dynamic from "next/dynamic";
import type { CorridorDefinition, DashboardDataMap } from "@/types";

interface ControlTowerMapProps {
  corridors: CorridorDefinition[];
  selectedCorridorId: number;
  onSelectCorridor: (id: number) => void;
  dataMap: DashboardDataMap;
}

const ControlTowerMapClient = dynamic(() => import("@/components/map/ControlTowerMapClient"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-cyan-950/40" />,
});

export function ControlTowerMap({
  corridors,
  selectedCorridorId,
  onSelectCorridor,
  dataMap,
}: ControlTowerMapProps) {
  return (
    <ControlTowerMapClient
      corridors={corridors}
      selectedCorridorId={selectedCorridorId}
      onSelectCorridor={onSelectCorridor}
      dataMap={dataMap}
    />
  );
}
