"use client";

import L from "leaflet";
import { useMemo } from "react";
import { Marker, Popup } from "react-leaflet";
import type { LatLngTuple } from "@/types";

interface LocationPinProps {
  position: LatLngTuple;
  label: string;
  role: "Origin" | "Destination";
  congestionLevel?: "Low" | "High";
}

export function LocationPin({ position, label, role, congestionLevel = "Low" }: LocationPinProps) {
  const isHigh = congestionLevel === "High";
  const icon = useMemo(
    () =>
      L.divIcon({
        className: "location-pin-icon",
        iconSize: isHigh ? [18, 18] : [14, 14],
        iconAnchor: isHigh ? [9, 9] : [7, 7],
        html: isHigh
          ? '<span style="display:block;width:18px;height:18px;border-radius:9999px;border:2px solid rgba(255,245,230,0.95);background:rgba(239,68,68,0.9);box-shadow:0 0 0 4px rgba(239,68,68,0.35), 0 0 14px rgba(248,113,113,0.65);"></span>'
          : '<span style="display:block;width:14px;height:14px;border-radius:9999px;border:2px solid rgba(255,255,255,0.9);background:rgba(24,200,209,0.75);box-shadow:0 0 0 3px rgba(24,200,209,0.25);"></span>',
      }),
    [isHigh],
  );

  return (
    <Marker position={position} icon={icon} zIndexOffset={isHigh ? 40 : 20}>
      <Popup>
        <div className="text-sm">
          <p className="font-semibold">{label}</p>
          <p className="opacity-70">{role}</p>
          <p className={isHigh ? "mt-1 font-medium text-red-300" : "mt-1 opacity-70"}>Congestion: {congestionLevel}</p>
        </div>
      </Popup>
    </Marker>
  );
}
