"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import { CycloneZone } from "@/components/map/CycloneZone";
import { LocationPin } from "@/components/map/LocationPin";
import { RoutePolyline } from "@/components/map/RoutePolyline";
import { VesselMarker } from "@/components/map/VesselMarker";
import type { CorridorDefinition, DashboardDataMap, LatLngTuple, RouteViewMode } from "@/types";

interface ControlTowerMapClientProps {
  corridors: CorridorDefinition[];
  selectedCorridorId: number;
  dataMap: DashboardDataMap;
  routeViewMode: RouteViewMode;
}

const MAP_CENTER: LatLngTuple = [16.5, 87.2];
const MAINTAIN_LOOP_MS = 12000;
const SLOW_STEAM_FACTOR = 0.58;

function segmentLength(a: LatLngTuple, b: LatLngTuple): number {
  const dLat = b[0] - a[0];
  const dLon = b[1] - a[1];
  return Math.hypot(dLat, dLon);
}

function samplePath(points: LatLngTuple[], progress: number): { position: LatLngTuple; rotationDeg: number } {
  if (points.length < 2) {
    return { position: points[0] ?? MAP_CENTER, rotationDeg: 0 };
  }

  const lengths: number[] = [];
  let totalLength = 0;

  for (let i = 0; i < points.length - 1; i += 1) {
    const length = segmentLength(points[i] as LatLngTuple, points[i + 1] as LatLngTuple);
    lengths.push(length);
    totalLength += length;
  }

  if (totalLength <= 0) {
    return { position: points[0], rotationDeg: 0 };
  }

  const normalizedProgress = ((progress % 1) + 1) % 1;
  const targetLength = normalizedProgress * totalLength;

  let traversed = 0;
  for (let i = 0; i < lengths.length; i += 1) {
    const segLen = lengths[i] as number;
    if (targetLength <= traversed + segLen || i === lengths.length - 1) {
      const from = points[i] as LatLngTuple;
      const to = points[i + 1] as LatLngTuple;
      const localT = segLen > 0 ? (targetLength - traversed) / segLen : 0;
      const lat = from[0] + (to[0] - from[0]) * localT;
      const lon = from[1] + (to[1] - from[1]) * localT;
      const rotationDeg = (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;
      return { position: [lat, lon], rotationDeg };
    }
    traversed += segLen;
  }

  return { position: points[0], rotationDeg: 0 };
}

function smoothPath(points: LatLngTuple[], iterations: number = 2): LatLngTuple[] {
  if (points.length < 3) {
    return points;
  }

  let current = points.slice();
  for (let iter = 0; iter < iterations; iter += 1) {
    const next: LatLngTuple[] = [current[0] as LatLngTuple];
    for (let i = 0; i < current.length - 1; i += 1) {
      const p0 = current[i] as LatLngTuple;
      const p1 = current[i + 1] as LatLngTuple;

      const q: LatLngTuple = [0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1]];
      const r: LatLngTuple = [0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1]];
      next.push(q, r);
    }
    next.push(current[current.length - 1] as LatLngTuple);
    current = next;
  }

  return current;
}

export default function ControlTowerMapClient({
  corridors,
  selectedCorridorId,
  dataMap,
  routeViewMode,
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
  const isNetworkMode = routeViewMode === "DP World Network";

  const selectedActionDisplay = dataMap[selectedCorridor.id]?.inference.action ?? "Unknown";
  const selectedActionNormalized = selectedActionDisplay.toLowerCase();
  const isSlowSteam =
    selectedActionNormalized.includes("slow steam") || selectedActionNormalized.includes("hold at hub");
  const isMaintainCourse = selectedActionNormalized.includes("maintain course");

  const [loopProgress, setLoopProgress] = useState(0);

  useEffect(() => {
    let rafId = 0;
    let start = 0;

    const animate = (timestamp: number) => {
      if (!start) {
        start = timestamp;
      }

      const elapsed = timestamp - start;
      setLoopProgress((elapsed % MAINTAIN_LOOP_MS) / MAINTAIN_LOOP_MS);
      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [selectedCorridor.id]);

  const selectedPath = selectedCorridor.path;
  const smoothSelectedPath = useMemo(() => smoothPath(selectedPath), [selectedPath]);
  const smoothAllPaths = useMemo(() => corridors.map((corridor) => smoothPath(corridor.path)), [corridors]);
  const maintainSample = useMemo(() => samplePath(smoothSelectedPath, loopProgress), [smoothSelectedPath, loopProgress]);
  const slowSample = useMemo(
    () => samplePath(smoothSelectedPath, loopProgress * SLOW_STEAM_FACTOR),
    [smoothSelectedPath, loopProgress],
  );

  const locationPins = useMemo(() => {
    const pins = new Map<string, { position: LatLngTuple; label: string; role: "Origin" | "Destination" }>();

    for (const corridor of corridors) {
      const originPos = corridor.path[0] as LatLngTuple;
      const destPos = corridor.path[corridor.path.length - 1] as LatLngTuple;

      const originKey = `${corridor.origin}:${originPos[0].toFixed(3)}:${originPos[1].toFixed(3)}`;
      const destKey = `${corridor.destination}:${destPos[0].toFixed(3)}:${destPos[1].toFixed(3)}`;

      if (!pins.has(originKey)) {
        pins.set(originKey, { position: originPos, label: corridor.origin, role: "Origin" });
      }
      if (!pins.has(destKey)) {
        pins.set(destKey, { position: destPos, label: corridor.destination, role: "Destination" });
      }
    }

    return Array.from(pins.values());
  }, [corridors]);

  const cycloneSeverity = dataMap[selectedCorridor.id]?.observedWeatherRaw ?? 0.5;

  return (
    <MapContainer center={MAP_CENTER} zoom={4} scrollWheelZoom className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; CartoDB'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />

      {isNetworkMode
        ? smoothAllPaths.map((path, index) => (
            <RoutePolyline
              key={`network-route-${corridors[index]?.id ?? index}`}
              points={path}
              color="#43f0ff"
              opacity={0.8}
              weight={3}
              dashed
            />
          ))
        : <RoutePolyline points={smoothSelectedPath} selectedAction={selectedActionDisplay} />}

      {locationPins.map((pin) => (
        <LocationPin
          key={`${pin.role}-${pin.label}-${pin.position[0]}-${pin.position[1]}`}
          position={pin.position}
          label={pin.label}
          role={pin.role}
        />
      ))}

      {!isNetworkMode && isSlowSteam && (
        <VesselMarker
          key={`vessel-maintain-ghost-${selectedCorridor.id}`}
          position={maintainSample.position}
          origin={selectedCorridor.origin}
          destination={selectedCorridor.destination}
          actionDisplay={selectedActionDisplay}
          fill="#64748b"
          stroke="#94a3b8"
          opacity={1}
          rotationDeg={maintainSample.rotationDeg}
          zIndexOffset={50}
          variant="legacy"
        />
      )}

      {!isNetworkMode && (
        <VesselMarker
          key={`vessel-selected-${selectedCorridor.id}`}
          position={isSlowSteam ? slowSample.position : maintainSample.position}
          origin={selectedCorridor.origin}
          destination={selectedCorridor.destination}
          actionDisplay={selectedActionDisplay}
          fill={isMaintainCourse ? "#ffffff" : isSlowSteam ? "#facc15" : "#67e8f9"}
          stroke={isMaintainCourse ? "#0f172a" : "#082f49"}
          opacity={1}
          rotationDeg={isSlowSteam ? slowSample.rotationDeg : maintainSample.rotationDeg}
          zIndexOffset={100}
        />
      )}

      {!isNetworkMode && <CycloneZone center={selectedCorridor.cyclone} severity={cycloneSeverity} />}
    </MapContainer>
  );
}
