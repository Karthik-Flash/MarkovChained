"use client";

import L from "leaflet";
import { useMemo } from "react";
import { Circle, Marker, Tooltip } from "react-leaflet";
import type { LatLngTuple } from "@/types";

interface CycloneZoneProps {
  center: LatLngTuple;
  severity: number;
}

export function CycloneZone({ center, severity }: CycloneZoneProps) {
  const radius = 80000 + severity * 130000;
  const warningIcon = useMemo(
    () =>
      L.divIcon({
        className: "cyclone-warning-icon",
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        html: '<span class="cyclone-warning-pulse">⚠</span>',
      }),
    [],
  );

  return (
    <>
      <Circle
        center={center}
        radius={radius}
        pathOptions={{
          color: "#ef4444",
          fillColor: "#ef4444",
          fillOpacity: 0.22,
          opacity: 0.95,
          dashArray: "4 10",
          lineCap: "round",
        }}
      >
        <Tooltip permanent direction="top" offset={[0, -6]}>
          Cyclone Risk Zone
        </Tooltip>
      </Circle>

      <Marker position={center} icon={warningIcon} zIndexOffset={220} />
    </>
  );
}
