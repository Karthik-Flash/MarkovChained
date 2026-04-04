"use client";

import { Circle, Tooltip } from "react-leaflet";
import type { LatLngTuple } from "@/types";

interface PortCongestionZoneProps {
  center: LatLngTuple;
  portLabel: string;
  severity: "mild" | "high";
}

export function PortCongestionZone({ center, portLabel, severity }: PortCongestionZoneProps) {
  const isHigh = severity === "high";

  const color = isHigh ? "#ef4444" : "#eab308";
  const fillColor = isHigh ? "#ef4444" : "#facc15";
  const radius = isHigh ? 140000 : 100000;

  return (
    <Circle
      center={center}
      radius={radius}
      pathOptions={{
        color,
        fillColor,
        fillOpacity: isHigh ? 0.28 : 0.2,
        opacity: 0.85,
        weight: 1.5,
      }}
    >
      <Tooltip direction="top" offset={[0, -4]}>
        {portLabel}: {isHigh ? "High congestion" : "Mild congestion"}
      </Tooltip>
    </Circle>
  );
}
