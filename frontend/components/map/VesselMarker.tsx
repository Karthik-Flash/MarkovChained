"use client";

import L from "leaflet";
import { MoveRight } from "lucide-react";
import { useMemo } from "react";
import { Marker, Popup } from "react-leaflet";
import type { LatLngTuple } from "@/types";

interface VesselMarkerProps {
  position: LatLngTuple;
  origin: string;
  destination: string;
  actionDisplay: string;
  fill: string;
  stroke?: string;
  opacity?: number;
  rotationDeg?: number;
  zIndexOffset?: number;
  variant?: "default" | "legacy";
}

export function VesselMarker({
  position,
  origin,
  destination,
  actionDisplay,
  fill,
  stroke = "#0f172a",
  opacity = 1,
  rotationDeg = 0,
  zIndexOffset = 0,
  variant = "default",
}: VesselMarkerProps) {
  const legacyMarkup = `
    <svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg" style="transform: rotate(${rotationDeg}deg); transform-origin: 50% 50%; opacity: ${opacity};">
      <path d="M11 1 L20 21 L11 16 L2 21 Z" fill="#64748b" stroke="#cbd5e1" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M11 6 L15 15.5 L11 13.6 L7 15.5 Z" fill="#334155"/>
      <circle cx="11" cy="17.8" r="2.2" fill="none" stroke="#e2e8f0" stroke-width="1.2"/>
    </svg>
  `;

  const defaultMarkup = `
    <svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg" style="transform: rotate(${rotationDeg}deg); transform-origin: 50% 50%; opacity: ${opacity};">
      <path d="M11 1 L20 21 L11 16 L2 21 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>
  `;

  const icon = useMemo(
    () =>
      L.divIcon({
        className: "vessel-nav-icon",
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        html: variant === "legacy" ? legacyMarkup : defaultMarkup,
      }),
    [defaultMarkup, legacyMarkup, variant],
  );

  return (
    <Marker position={position} icon={icon} zIndexOffset={zIndexOffset}>
      <Popup>
        <div className="min-w-[170px] text-sm">
          <p className="flex items-center gap-1.5 font-semibold">
            <span>{origin}</span>
            <MoveRight className="size-4" />
            <span>{destination}</span>
          </p>
          <p className="mt-1">Recommended action: {actionDisplay}</p>
        </div>
      </Popup>
    </Marker>
  );
}
