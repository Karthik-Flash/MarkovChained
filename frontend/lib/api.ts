import { API_BASE_URL, TRANSPORT_MODE_TO_ENC } from "@/lib/constants";
import type { InferenceResponse, MetadataResponse, ShipType, TransportMode } from "@/types";

interface InferParams {
  corridorName: string;
  transportMode: TransportMode;
  shipType: ShipType;
  cargoWeightMt: number;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let details = response.statusText;
    try {
      const payload = (await response.json()) as { detail?: string };
      details = payload.detail ?? details;
    } catch {
      // Keep status text when response body is non-json.
    }
    throw new Error(`API ${path} failed: ${details}`);
  }

  return (await response.json()) as T;
}

export async function readMetadata(): Promise<MetadataResponse> {
  return requestJson<MetadataResponse>("/metadata", { method: "GET" });
}

export async function inferCorridor(params: InferParams): Promise<InferenceResponse> {
  return requestJson<InferenceResponse>("/infer/route", {
    method: "POST",
    body: JSON.stringify({
      corridor_name: params.corridorName,
      transport_mode_enc: TRANSPORT_MODE_TO_ENC[params.transportMode],
      ship_type: params.shipType,
      cargo_weight_mt: params.cargoWeightMt,
    }),
  });
}
