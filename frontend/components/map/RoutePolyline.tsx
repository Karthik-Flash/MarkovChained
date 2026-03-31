"use client";

import { Polyline } from "react-leaflet";
import type { LatLngTuple } from "@/types";

interface RoutePolylineProps {
  points: LatLngTuple[];
  selected: boolean;
  onClick: () => void;
}

export function RoutePolyline({ points, selected, onClick }: RoutePolylineProps) {
  return (
    <Polyline
      positions={points}
      pathOptions={{
        color: selected ? "#43f0ff" : "#7dd3fc",
        opacity: selected ? 0.95 : 0.45,
        weight: selected ? 4 : 2,
        dashArray: selected ? undefined : "4 8",
      }}
      eventHandlers={{ click: onClick }}
    />
  );
}
