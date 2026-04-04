"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Circle, CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import { LocationPin } from "@/components/map/LocationPin";
import { PortCongestionZone } from "@/components/map/PortCongestionZone";
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
const SAME_PORT_EPSILON = 0.05;
const SUEZ_CANAL_POSITION: LatLngTuple = [30.5, 32.3];
const REROUTE_SPEED_BY_ID: Record<string, number> = {
  R1: 1,
  R2: 0.76,
  R3: 0.56,
};

function normalizePortLabel(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function isNearSamePort(a: LatLngTuple, b: LatLngTuple): boolean {
  return Math.abs(a[0] - b[0]) <= SAME_PORT_EPSILON && Math.abs(a[1] - b[1]) <= SAME_PORT_EPSILON;
}

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

function sampleQuadraticBezier(
  start: LatLngTuple,
  control: LatLngTuple,
  end: LatLngTuple,
  samples: number,
): LatLngTuple[] {
  const output: LatLngTuple[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const oneMinusT = 1 - t;
    const lat = oneMinusT * oneMinusT * start[0] + 2 * oneMinusT * t * control[0] + t * t * end[0];
    const lon = oneMinusT * oneMinusT * start[1] + 2 * oneMinusT * t * control[1] + t * t * end[1];
    output.push([lat, lon]);
  }
  return output;
}

function curvedSegment(start: LatLngTuple, end: LatLngTuple, curvature: number, direction: 1 | -1): LatLngTuple[] {
  const midLat = (start[0] + end[0]) / 2;
  const midLon = (start[1] + end[1]) / 2;

  const dLat = end[0] - start[0];
  const dLon = end[1] - start[1];
  const length = Math.hypot(dLat, dLon);

  if (length === 0) {
    return [start, end];
  }

  const perpLat = (-dLon / length) * length * curvature * direction;
  const perpLon = (dLat / length) * length * curvature * direction;
  const control: LatLngTuple = [midLat + perpLat, midLon + perpLon];

  return sampleQuadraticBezier(start, control, end, 18);
}

function buildCurvedWaypointPath(points: LatLngTuple[], bendDirection: 1 | -1): LatLngTuple[] {
  if (points.length < 2) {
    return points;
  }

  const result: LatLngTuple[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const segment = curvedSegment(points[i] as LatLngTuple, points[i + 1] as LatLngTuple, 0.16, bendDirection);
    if (i === 0) {
      result.push(...segment);
    } else {
      result.push(...segment.slice(1));
    }
  }

  return result;
}

function tangentRotationDeg(points: LatLngTuple[], index: number): number {
  if (points.length < 2) {
    return 0;
  }

  const safeIdx = Math.max(1, Math.min(points.length - 2, index));
  const prev = points[safeIdx - 1] as LatLngTuple;
  const next = points[safeIdx + 1] as LatLngTuple;

  // Screen-like slope angle: x=longitude, y=latitude.
  let angle = (Math.atan2(next[0] - prev[0], next[1] - prev[1]) * 180) / Math.PI;
  if (angle > 90) {
    angle -= 180;
  }
  if (angle < -90) {
    angle += 180;
  }

  return angle;
}

function rerouteBendDirection(corridorName: string, optionId: string): 1 | -1 {
  if (corridorName === "SIN→SYD") {
    return optionId === "R2" ? -1 : 1;
  }

  if (corridorName === "SHZ→RTM") {
    if (optionId === "R1") {
      return 1;
    }
    return -1;
  }

  return 1;
}

function latLonDistanceMeters(a: LatLngTuple, b: LatLngTuple): number {
  const latDeltaMeters = (a[0] - b[0]) * 111_320;
  const lonScale = Math.cos((((a[0] + b[0]) / 2) * Math.PI) / 180);
  const lonDeltaMeters = (a[1] - b[1]) * 111_320 * lonScale;
  return Math.hypot(latDeltaMeters, lonDeltaMeters);
}

function buildStormCircle(boundary: LatLngTuple[], rippleCount: number = 4): {
  center: LatLngTuple;
  radiusMeters: number;
  rippleStepMeters: number;
  rippleCount: number;
} {
  if (boundary.length < 3) {
    return {
      center: MAP_CENTER,
      radiusMeters: 100_000,
      rippleStepMeters: 24_000,
      rippleCount,
    };
  }

  const lats = boundary.map((point) => point[0]);
  const lons = boundary.map((point) => point[1]);
  const center: LatLngTuple = [
    (Math.min(...lats) + Math.max(...lats)) / 2,
    (Math.min(...lons) + Math.max(...lons)) / 2,
  ];

  const baseRadius = Math.max(
    55_000,
    ...boundary.map((point) => latLonDistanceMeters(center, point) * 0.42),
  );

  const step = Math.max(16_000, baseRadius * 0.22);
  return {
    center,
    radiusMeters: baseRadius,
    rippleStepMeters: step,
    rippleCount,
  };
}

function MapResizeSync({ watchKey }: { watchKey: string }) {
  const map = useMap();

  useEffect(() => {
    const refresh = () => map.invalidateSize({ pan: false, animate: false });

    const immediate = window.setTimeout(refresh, 0);
    const delayed = window.setTimeout(refresh, 180);

    return () => {
      window.clearTimeout(immediate);
      window.clearTimeout(delayed);
    };
  }, [map, watchKey]);

  useEffect(() => {
    const onResize = () => map.invalidateSize({ pan: false, animate: false });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [map]);

  return null;
}

function MapModeViewport({ isNetworkMode }: { isNetworkMode: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (isNetworkMode) {
      map.setView([20, 0], 2, { animate: false });
      return;
    }

    map.setView(MAP_CENTER, 4, { animate: false });
  }, [map, isNetworkMode]);

  return null;
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
  const selectedInference = dataMap[selectedCorridor.id]?.inference;
  const selectedActionNormalized = selectedActionDisplay.toLowerCase();
  const isReroute = selectedActionNormalized.includes("reroute");
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
    const pins = new Map<
      string,
      {
        position: LatLngTuple;
        label: string;
        role: "Origin" | "Destination";
      }
    >();

    for (const corridor of corridors) {
      const originPos = corridor.path[0] as LatLngTuple;
      const destPos = corridor.path[corridor.path.length - 1] as LatLngTuple;

      const originKey = `${corridor.origin}:${originPos[0].toFixed(3)}:${originPos[1].toFixed(3)}`;
      const destKey = `${corridor.destination}:${destPos[0].toFixed(3)}:${destPos[1].toFixed(3)}`;

      if (!pins.has(originKey)) {
        pins.set(originKey, {
          position: originPos,
          label: corridor.origin,
          role: "Origin",
        });
      }

      if (!pins.has(destKey)) {
        pins.set(destKey, {
          position: destPos,
          label: corridor.destination,
          role: "Destination",
        });
      }
    }

    return Array.from(pins.values());
  }, [corridors]);

  const destinationCongestionZones = useMemo<Array<{ center: LatLngTuple; portLabel: string; severity: "high" | "mild" }>>(() => {
    const zones = new Map<
      string,
      {
        center: LatLngTuple;
        portLabel: string;
        severityRank: number;
      }
    >();

    for (const corridor of corridors) {
      const inference = dataMap[corridor.id]?.inference;
      if (!inference) {
        continue;
      }

      const prob = Number(inference.congestion_probability ?? 0);
      const level = String(inference.congestion_level ?? "").toLowerCase();

      let severityRank = 0;
      if (level === "high" || prob >= 0.55) {
        severityRank = 2;
      } else if (prob >= 0.3) {
        severityRank = 1;
      }

      if (severityRank === 0) {
        continue;
      }

      const destPos = corridor.path[corridor.path.length - 1] as LatLngTuple;
      const key = `${corridor.destination}:${destPos[0].toFixed(3)}:${destPos[1].toFixed(3)}`;
      const existing = zones.get(key);

      if (!existing || severityRank > existing.severityRank) {
        zones.set(key, {
          center: destPos,
          portLabel: corridor.destination,
          severityRank,
        });
      }
    }

    const selectedOriginPos = selectedCorridor.path[0] as LatLngTuple;
    const selectedOriginLabel = normalizePortLabel(selectedCorridor.origin);

    return Array.from(zones.values())
      .filter((zone) => {
        const zoneLabel = normalizePortLabel(zone.portLabel);
        if (zoneLabel === selectedOriginLabel) {
          return false;
        }

        return !isNearSamePort(zone.center, selectedOriginPos);
      })
      .map((zone) => ({
        center: zone.center,
        portLabel: zone.portLabel,
        severity: zone.severityRank >= 2 ? "high" : "mild",
      }));
  }, [corridors, dataMap, selectedCorridor]);

  const rerouteAlternatives = useMemo(
    () =>
      (selectedInference?.reroute_options ?? [])
        .filter((option) => option.waypoints.length >= 2)
        .map((option) => ({
          optionId: option.option_id,
          label: option.label,
          etaDays: option.eta_days,
          waypoints: option.waypoints,
          points: buildCurvedWaypointPath(
            option.waypoints.map((wp) => [wp.lat, wp.lon] as LatLngTuple),
            rerouteBendDirection(selectedCorridor.name, option.option_id),
          ),
        })),
    [selectedInference, selectedCorridor.name],
  );

  const rerouteColorById: Record<string, string> = {
    R1: "#38bdf8",
    R2: "#22c55e",
    R3: "#ef4444",
  };

  const rerouteLabelOffsets: Record<string, LatLngTuple> = {
    R1: [0.25, 0.5],
    R2: [-0.35, 0.25],
    R3: [0.5, -0.6],
  };

  const showRerouteAlternatives = !isNetworkMode && isReroute && rerouteAlternatives.length > 0;
  const showSuezWarning = showRerouteAlternatives && selectedCorridor.name === "SHZ→RTM";
  const stormRegions = useMemo(
    () =>
      (selectedInference?.storm_regions ?? [])
        .map((region) => {
          const boundary = region.boundary.map((point) => [point.lat, point.lon] as LatLngTuple);
          const circle = buildStormCircle(boundary);
          return {
            name: region.name,
            center: circle.center,
            radiusMeters: circle.radiusMeters,
            rippleStepMeters: circle.rippleStepMeters,
            rippleCount: circle.rippleCount,
          };
        })
        .filter((region) => region.radiusMeters > 0),
    [selectedInference],
  );
  const showStormRegions = showRerouteAlternatives && stormRegions.length > 0;
  const primaryReroute = useMemo(
    () => rerouteAlternatives.find((alt) => alt.optionId === "R1") ?? rerouteAlternatives[0],
    [rerouteAlternatives],
  );
  const rerouteSamplesById = useMemo(
    () =>
      Object.fromEntries(
        rerouteAlternatives.map((alt) => {
          const speed = REROUTE_SPEED_BY_ID[alt.optionId] ?? REROUTE_SPEED_BY_ID.R3;
          return [alt.optionId, samplePath(alt.points, loopProgress * speed)];
        }),
      ),
    [rerouteAlternatives, loopProgress],
  );
  const rerouteSample = rerouteSamplesById[primaryReroute?.optionId ?? ""];

  const selectedVesselSample = showRerouteAlternatives
    ? rerouteSample
    : isSlowSteam
      ? slowSample
      : maintainSample;

  return (
    <MapContainer center={MAP_CENTER} zoom={4} scrollWheelZoom className="h-full w-full">
      <MapResizeSync watchKey={`${routeViewMode}-${selectedCorridorId}-${corridors.length}`} />
      <MapModeViewport isNetworkMode={isNetworkMode} />
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
        : !showRerouteAlternatives
          ? <RoutePolyline points={smoothSelectedPath} selectedAction={selectedActionDisplay} />
          : null}

      {showRerouteAlternatives && rerouteAlternatives.map((alt) => (
        <RoutePolyline
          key={`reroute-alt-${alt.optionId}`}
          points={alt.points}
          color={rerouteColorById[alt.optionId] ?? "#f8fafc"}
          opacity={0.88}
          weight={3.5}
          dashed={alt.optionId === "R1"}
        />
      ))}

      {showStormRegions && stormRegions.map((region) => (
        <Fragment key={`storm-region-${region.name}`}>
          <Circle
            center={region.center}
            radius={region.radiusMeters}
            pathOptions={{
              color: "#9ca3af",
              weight: 2.4,
              opacity: 0.95,
              fillColor: "#9ca3af",
              fillOpacity: 0.12,
            }}
          />
          {Array.from({ length: region.rippleCount }, (_, index) => {
            const phase = ((loopProgress + index / region.rippleCount) % 1 + 1) % 1;
            const radius = region.radiusMeters + region.rippleStepMeters * phase * region.rippleCount;
            // Keep rings visible early, then dissolve the last part before reset.
            const endFade = phase > 0.82 ? Math.max(0, 1 - (phase - 0.82) / 0.18) : 1;
            const opacity = (0.74 - phase * 0.42) * endFade;

            return (
              <Circle
                key={`storm-ripple-${region.name}-${index}`}
                center={region.center}
                radius={radius}
                pathOptions={{
                  color: "#9ca3af",
                  weight: 1.6,
                  opacity,
                  dashArray: "4 10",
                  lineCap: "round",
                  fillOpacity: 0,
                }}
              />
            );
          })}
        </Fragment>
      ))}

      {showSuezWarning && (
        <>
          {Array.from({ length: 3 }, (_, index) => {
            const phase = ((loopProgress + index / 3) % 1 + 1) % 1;
            const radius = 36_000 + phase * 88_000;
            const endFade = phase > 0.8 ? Math.max(0, 1 - (phase - 0.8) / 0.2) : 1;
            const opacity = (0.82 - phase * 0.46) * endFade;

            return (
              <Circle
                key={`suez-warning-ripple-${index}`}
                center={SUEZ_CANAL_POSITION}
                radius={radius}
                pathOptions={{
                  color: "#ef4444",
                  weight: 1.8,
                  opacity,
                  dashArray: "4 10",
                  lineCap: "round",
                  fillOpacity: 0,
                }}
              />
            );
          })}

          <Circle
            center={SUEZ_CANAL_POSITION}
            radius={22_000}
            pathOptions={{
              color: "#ef4444",
              weight: 2.2,
              opacity: 0.95,
              fillColor: "#ef4444",
              fillOpacity: 0.12,
            }}
          />

          <CircleMarker
            center={SUEZ_CANAL_POSITION}
            radius={0.8}
            pathOptions={{
              color: "transparent",
              fillColor: "transparent",
              fillOpacity: 0,
              weight: 0,
            }}
          >
            <Tooltip
              permanent
              direction="top"
              offset={[0, -16]}
              opacity={1}
              className="m-0! border-0! bg-transparent! p-0!"
            >
              <span
                className="font-heading text-[13px] font-extrabold tracking-[0.02em]"
                style={{
                  color: "#fca5a5",
                  textShadow: "0 0 10px rgba(0,0,0,0.95)",
                  whiteSpace: "nowrap",
                }}
              >
                Suez Canal blocked by the Ever Given
              </span>
            </Tooltip>
          </CircleMarker>

          <CircleMarker
            center={SUEZ_CANAL_POSITION}
            radius={0.5}
            pathOptions={{
              color: "transparent",
              fillColor: "transparent",
              fillOpacity: 0,
              weight: 0,
            }}
          >
            <Tooltip
              permanent
              direction="center"
              opacity={1}
              className="m-0! border-0! bg-transparent! p-0!"
            >
              <span
                className="font-heading text-base font-extrabold"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "28px",
                  height: "28px",
                  borderRadius: "9999px",
                  background: "rgba(239,68,68,0.95)",
                  border: "2px solid #fee2e2",
                  color: "#fff",
                  boxShadow: "0 0 14px rgba(239,68,68,0.85)",
                }}
              >
                ⚠
              </span>
            </Tooltip>
          </CircleMarker>
        </>
      )}

      {showRerouteAlternatives && rerouteAlternatives.map((alt) => {
        const anchorIdx = Math.max(2, Math.floor(alt.points.length * 0.22));
        const anchor = alt.points[anchorIdx] ?? alt.points[0];
        const offset = rerouteLabelOffsets[alt.optionId] ?? [0, 0];
        const labelPos: LatLngTuple = [anchor[0] + offset[0], anchor[1] + offset[1]];
        const labelRotation = tangentRotationDeg(alt.points, anchorIdx);

        return (
          <CircleMarker
            key={`reroute-label-${alt.optionId}`}
            center={labelPos}
            radius={0.8}
            pathOptions={{
              color: "transparent",
              fillColor: "transparent",
              fillOpacity: 0,
              weight: 0,
            }}
          >
            <Tooltip
              permanent
              direction="top"
              offset={[0, -2]}
              opacity={1}
              className="m-0! border-0! bg-transparent! p-0!"
            >
              <span
                className="font-heading text-lg font-black tracking-[0.08em]"
                style={{
                  color: rerouteColorById[alt.optionId] ?? "#f8fafc",
                  textShadow: "0 0 10px rgba(0,0,0,0.98), 0 0 18px rgba(0,0,0,0.85)",
                  display: "inline-block",
                  transform: `rotate(${labelRotation}deg)`,
                  transformOrigin: "center",
                }}
              >
                {alt.optionId}
              </span>
            </Tooltip>
          </CircleMarker>
        );
      })}

      {showRerouteAlternatives && rerouteAlternatives.flatMap((alt) => (
        alt.waypoints
          .slice(1, Math.max(1, alt.waypoints.length - 1))
          .map((wp) => (
            <CircleMarker
              key={`reroute-port-${alt.optionId}-${wp.port}`}
              center={[wp.lat, wp.lon]}
              radius={4}
              pathOptions={{
                color: rerouteColorById[alt.optionId] ?? "#f8fafc",
                fillColor: rerouteColorById[alt.optionId] ?? "#f8fafc",
                fillOpacity: 0.95,
                weight: 1.2,
              }}
            >
              <Tooltip
                permanent
                direction="top"
                offset={[0, -8]}
                opacity={1}
                className="m-0! border-0! bg-transparent! p-0!"
              >
                <span
                  className="font-heading text-xs font-bold tracking-[0.02em]"
                  style={{
                    color: rerouteColorById[alt.optionId] ?? "#f8fafc",
                    textShadow: "0 0 8px rgba(0,0,0,0.95)",
                  }}
                >
                  {wp.port}
                </span>
              </Tooltip>
            </CircleMarker>
          ))
      ))}

      {destinationCongestionZones.map((zone) => (
        <PortCongestionZone
          key={`${zone.portLabel}-${zone.center[0]}-${zone.center[1]}`}
          center={zone.center}
          portLabel={zone.portLabel}
          severity={zone.severity}
        />
      ))}

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
          position={selectedVesselSample.position}
          origin={selectedCorridor.origin}
          destination={selectedCorridor.destination}
          actionDisplay={selectedActionDisplay}
          fill={showRerouteAlternatives ? "#cbd5e1" : isMaintainCourse ? "#ffffff" : isSlowSteam ? "#facc15" : "#67e8f9"}
          stroke={showRerouteAlternatives ? "#94a3b8" : isMaintainCourse ? "#0f172a" : "#082f49"}
          opacity={showRerouteAlternatives ? 0.56 : 1}
          rotationDeg={selectedVesselSample.rotationDeg}
          zIndexOffset={100}
        />
      )}

      {showRerouteAlternatives && rerouteAlternatives
        .filter((alt) => alt.optionId !== (primaryReroute?.optionId ?? ""))
        .map((alt) => {
          const sample = rerouteSamplesById[alt.optionId] ?? samplePath(alt.points, loopProgress);
          const color = rerouteColorById[alt.optionId] ?? "#f8fafc";

          return (
            <VesselMarker
              key={`vessel-reroute-${alt.optionId}-${selectedCorridor.id}`}
              position={sample.position}
              origin={selectedCorridor.origin}
              destination={selectedCorridor.destination}
              actionDisplay={selectedActionDisplay}
              fill={color}
              stroke={color}
              opacity={0.95}
              rotationDeg={sample.rotationDeg}
              zIndexOffset={90}
            />
          );
        })}
    </MapContainer>
  );
}
