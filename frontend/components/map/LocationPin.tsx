"use client";

import L from "leaflet";
import { useMemo } from "react";
import { Marker, Popup } from "react-leaflet";
import type { LatLngTuple } from "@/types";

interface LocationPinProps {
  position: LatLngTuple;
  label: string;
  role: "Origin" | "Destination";
}

export function LocationPin({ position, label, role }: LocationPinProps) {
  const icon = useMemo(
    () =>
      L.divIcon({
        className: "location-pin-icon",
        iconSize: [14, 14],
        iconAnchor: [7, 7],
        html: '<span style="display:block;width:14px;height:14px;border-radius:9999px;border:2px solid rgba(255,255,255,0.9);background:rgba(24,200,209,0.75);box-shadow:0 0 0 3px rgba(24,200,209,0.25);"></span>',
      }),
    [],
  );

  return (
    <Marker position={position} icon={icon} zIndexOffset={20}>
      <Popup>
        <div className="text-sm">
          <p className="font-semibold">{label}</p>
          <p className="opacity-70">{role}</p>
        </div>
      </Popup>
    </Marker>
  );
}
