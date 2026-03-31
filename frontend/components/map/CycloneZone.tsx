"use client";

import { Circle, Tooltip } from "react-leaflet";
import type { LatLngTuple } from "@/types";

interface CycloneZoneProps {
  center: LatLngTuple;
  severity: number;
}

export function CycloneZone({ center, severity }: CycloneZoneProps) {
  const radius = 80000 + severity * 130000;

  return (
    <Circle
      center={center}
      radius={radius}
      pathOptions={{
        color: "#fb923c",
        fillColor: "#fb923c",
        fillOpacity: 0.18,
        opacity: 0.8,
      }}
    >
      <Tooltip permanent direction="top" offset={[0, -6]}>
        Cyclone risk zone
      </Tooltip>
    </Circle>
  );
}
