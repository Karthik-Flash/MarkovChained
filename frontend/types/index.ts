export type TransportMode = "SEA" | "AIR";
export type RouteViewMode = "DP World Network" | "Markov Chained";

export type LatLngTuple = [number, number];

export interface CorridorDefinition {
  id: number;
  name: string;
  origin: string;
  destination: string;
  path: LatLngTuple[];
  vessel: LatLngTuple;
  cyclone: LatLngTuple;
  risk: number;
}

export interface HeadlineItem {
  title: string;
  source: string;
  url: string;
  risk_score: number;
}

export interface InferenceResponse {
  action: string;
  action_display: string;
  confidence: number;
  confidence_interval: {
    lower: number;
    upper: number;
    method: string;
  };
  congestion_probability: number;
  congestion_level: string;
  delay_saved_hours: number;
  cost_saved_usd: number;
  carbon_saved_tco2: number;
  transport_mode_enc: number;
  transport_mode_label: string;
  wind_kmh: number;
  sea_state: string;
  visibility: string;
  alert_reason: string;
  state: {
    index: number;
    corridor: string;
    weather: string;
    congestion: string;
  };
  q_values: Record<string, number>;
  explanation: string[];
  headlines: HeadlineItem[];
}

export interface CorridorData {
  inference: InferenceResponse;
  observedWeatherRaw: number;
}

export type DashboardDataMap = Record<number, CorridorData>;

export interface MetadataResponse {
  model_auc?: number;
  feature_order?: string[];
  corridors?: Record<string, string>;
  weather_thresholds?: Record<string, [number, number]>;
  congestion_threshold?: number;
  latest_weather_by_corridor?: Record<number, { weather_severity_raw: number }>;
}

export interface BackendCorridor {
  corridor_id: number;
  corridor_name: string;
  origin: string;
  destination: string;
}

export interface CorridorsResponse {
  corridor_map: Record<string, string>;
  corridor_name_to_id: Record<string, number>;
  corridors: BackendCorridor[];
}

export interface DashboardSnapshot {
  corridor: CorridorDefinition;
  confidence: number;
  actionDisplay: string;
  congestionLevel: string;
}
