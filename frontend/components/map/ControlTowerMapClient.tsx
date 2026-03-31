"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import { CycloneZone } from "@/components/map/CycloneZone";
import { RoutePolyline } from "@/components/map/RoutePolyline";
import { VesselMarker } from "@/components/map/VesselMarker";
import type { CorridorDefinition, DashboardDataMap, LatLngTuple } from "@/types";

interface ControlTowerMapClientProps {
  corridors: CorridorDefinition[];
  selectedCorridorId: number;
  onSelectCorridor: (id: number) => void;
  dataMap: DashboardDataMap;
}

const MAP_CENTER: LatLngTuple = [16.5, 87.2];

export default function ControlTowerMapClient({
  corridors,
  selectedCorridorId,
  onSelectCorridor,
  dataMap,
}: ControlTowerMapClientProps) {
  useEffect(() => {
    delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);

  const selectedCorridor = useMemo(() => {
    return corridors.find((corridor) => corridor.id === selectedCorridorId) ?? corridors[0];
  }, [corridors, selectedCorridorId]);

  const cycloneSeverity = dataMap[selectedCorridor.id]?.observedWeatherRaw ?? 0.5;

  return (
    <MapContainer center={MAP_CENTER} zoom={4} scrollWheelZoom className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; CartoDB'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />

      {corridors.map((corridor) => (
        <RoutePolyline
          key={corridor.id}
          points={corridor.path}
          selected={corridor.id === selectedCorridor.id}
          onClick={() => onSelectCorridor(corridor.id)}
        />
      ))}

      {corridors.map((corridor) => (
        <VesselMarker
          key={`vessel-${corridor.id}`}
          position={corridor.vessel}
          origin={corridor.origin}
          destination={corridor.destination}
          actionDisplay={dataMap[corridor.id]?.inference.action_display ?? "Pending"}
        />
      ))}

      <CycloneZone center={selectedCorridor.cyclone} severity={cycloneSeverity} />
    </MapContainer>
  );
}
