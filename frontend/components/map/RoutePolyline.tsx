"use client";

import { Polyline } from "react-leaflet";
import type { LatLngTuple } from "@/types";

interface RoutePolylineProps {
  points: LatLngTuple[];
  selectedAction?: string;
  color?: string;
  opacity?: number;
  weight?: number;
  dashed?: boolean;
}

export function RoutePolyline({ points, selectedAction, color, opacity, weight, dashed }: RoutePolylineProps) {
  const normalizedAction = selectedAction?.toLowerCase() ?? "";
  const isSlowSteam = normalizedAction.includes("slow steam") || normalizedAction.includes("hold at hub");
  const strokeColor = color ?? (isSlowSteam ? "#facc15" : "#43f0ff");
  const strokeOpacity = opacity ?? 0.95;
  const strokeWeight = weight ?? 4;

  return (
    <Polyline
      positions={points}
      pathOptions={{
        color: strokeColor,
        opacity: strokeOpacity,
        weight: strokeWeight,
        dashArray: dashed ? "6 10" : undefined,
        lineCap: dashed ? "round" : "butt",
      }}
    />
  );
}
