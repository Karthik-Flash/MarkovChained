"use client";

import { MoveRight } from "lucide-react";
import { Marker, Popup } from "react-leaflet";
import type { LatLngTuple } from "@/types";

interface VesselMarkerProps {
  position: LatLngTuple;
  origin: string;
  destination: string;
  actionDisplay: string;
}

export function VesselMarker({ position, origin, destination, actionDisplay }: VesselMarkerProps) {
  return (
    <Marker position={position}>
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
