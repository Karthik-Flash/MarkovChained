from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
import math
import json
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import xgboost as xgb


APP_TITLE = "MarkovChained Inference API"
APP_VERSION = "1.0.0"


BASE_DIR = Path(__file__).resolve().parent

# Backend was moved under backend/, while model artifacts remain in ML/outputs.
OUTPUTS_DIR_CANDIDATES = [
    BASE_DIR / "outputs",
    BASE_DIR.parent / "ML" / "outputs",
]


def _outputs_candidates(filename: str) -> List[Path]:
    return [directory / filename for directory in OUTPUTS_DIR_CANDIDATES]


XGB_MODEL_JSON_CANDIDATES = [
    *_outputs_candidates("xgb_congestion_model.json"),
]
Q_TABLE_CANDIDATES = [
    *_outputs_candidates("q_table.json"),
]
PIPELINE_CONFIG_CANDIDATES = [
    *_outputs_candidates("pipeline_config.json"),
]
DEMO_OUTPUTS_CANDIDATES = [
    *_outputs_candidates("demo_outputs.json"),
]


DISRUPTION_ENC_MAP_DEFAULT: Dict[str, int] = {
    "none": 0,
    "port_congestion": 1,
    "severe_weather": 2,
    "geopolitical": 3,
}

MARKOV_FOCUS_CORRIDOR_NAMES_DEFAULT = [
    "TOK→SIN",
    "SHA→PUS",
    "SIN→JEA",
    "MUM→JEA",
    "SHZ→RTM",
    "SIN→SYD",
]

MARKOV_FOCUS_ROUTE_KEYS_DEFAULT = [
    "TOK_SIN",
    "SHA_PUS",
    "SIN_JEA",
    "MUM_JEA",
    "SHZ_RTM",
    "SIN_SYD",
]


def _first_existing_path(candidates: List[Path]) -> Optional[Path]:
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


class StatePayload(BaseModel):
    index: int
    corridor: str
    weather: str
    congestion: str


class ConfidenceIntervalPayload(BaseModel):
    lower: float
    upper: float
    method: str


class HeadlineItem(BaseModel):
    title: str
    source: str
    url: str
    risk_score: float = Field(ge=0.0, le=1.0)


class RerouteWaypoint(BaseModel):
    port: str
    lat: float
    lon: float


class RerouteOption(BaseModel):
    option_id: str
    label: str
    eta_days: int
    waypoints: List[RerouteWaypoint]


class StormPoint(BaseModel):
    lat: float
    lon: float


class StormRegion(BaseModel):
    name: str
    boundary: List[StormPoint]


class InferenceResponse(BaseModel):
    action: str
    action_display: str
    confidence: float
    confidence_interval: ConfidenceIntervalPayload
    congestion_probability: float
    congestion_level: str
    delay_saved_hours: float
    cost_saved_usd: float
    carbon_saved_tco2: float
    transport_mode_enc: int
    transport_mode_label: str
    wind_kmh: float
    sea_state: str
    visibility: str
    alert_reason: str
    state: StatePayload
    q_values: Dict[str, float]
    explanation: List[str]
    headlines: List[HeadlineItem]
    reroute_options: List[RerouteOption] = Field(default_factory=list)
    storm_regions: List[StormRegion] = Field(default_factory=list)
    ship_type: str
    cargo_weight_mt: float
    fuel_mt: float
    co2_tco2: float
    fuel_cost_usd: float


class WeatherUpdateRequest(BaseModel):
    corridor_id: Optional[int] = Field(default=None)
    corridor_name: Optional[str] = Field(default=None)
    origin: Optional[str] = Field(default=None)
    destination: Optional[str] = Field(default=None)
    weather_severity_raw: float = Field(
        ge=0.0,
        le=1.0,
        description="Weather severity index in [0,1] from Open-Meteo mapping.",
    )
    source: str = Field(default="open-meteo")
    observed_at: Optional[datetime] = Field(default=None)
    meta: Dict[str, Any] = Field(default_factory=dict)


class InflationUpdateRequest(BaseModel):
    inflation_rate: float = Field(ge=0.0)
    currency: str = Field(default="USD", description="Only USD is supported.")
    source: str = Field(default="world-bank")
    observed_at: Optional[datetime] = Field(default=None)
    meta: Dict[str, Any] = Field(default_factory=dict)


class LeadTimeUpdateRequest(BaseModel):
    corridor_id: Optional[int] = Field(default=None)
    corridor_name: Optional[str] = Field(default=None)
    origin: Optional[str] = Field(default=None)
    destination: Optional[str] = Field(default=None)
    base_lead_time: Optional[int] = Field(default=None, ge=1)
    distance_nm: Optional[float] = Field(default=None, gt=0)
    source: str = Field(default="searoutes")
    observed_at: Optional[datetime] = Field(default=None)
    meta: Dict[str, Any] = Field(default_factory=dict)


class WindUpdateRequest(BaseModel):
    corridor_id: Optional[int] = Field(default=None)
    corridor_name: Optional[str] = Field(default=None)
    origin: Optional[str] = Field(default=None)
    destination: Optional[str] = Field(default=None)
    wind_kmh: float = Field(ge=0.0)
    wind_direction: Optional[str] = Field(default=None)
    source: str = Field(default="open-meteo")
    observed_at: Optional[datetime] = Field(default=None)
    meta: Dict[str, Any] = Field(default_factory=dict)


class HeadlinesUpdatePayload(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    source: str = Field(min_length=1, max_length=100)
    url: str = Field(min_length=1, max_length=500)
    risk_score: float = Field(ge=0.0, le=1.0)


class HeadlinesUpdateRequest(BaseModel):
    corridor_id: Optional[int] = Field(default=None)
    corridor_name: Optional[str] = Field(default=None)
    origin: Optional[str] = Field(default=None)
    destination: Optional[str] = Field(default=None)
    headlines: List[HeadlinesUpdatePayload] = Field(default_factory=list, max_length=10)
    source: str = Field(default="news-api")
    observed_at: Optional[datetime] = Field(default=None)
    meta: Dict[str, Any] = Field(default_factory=dict)


class RouteInferenceRequest(BaseModel):
    corridor_id: Optional[int] = Field(default=None)
    corridor_name: Optional[str] = Field(default=None)
    origin: Optional[str] = Field(default=None)
    destination: Optional[str] = Field(default=None)
    disruption_type: Optional[str] = Field(
        default=None,
        description="Optional v7 disruption label: none|port_congestion|severe_weather|geopolitical.",
    )
    disruption_event_enc: Optional[int] = Field(
        default=None,
        ge=0,
        le=3,
        description="Optional explicit disruption encoding override.",
    )
    transport_mode_enc: int = Field(default=1, ge=0)
    transport_weight_kg: int = Field(
        default=5000,
        ge=0,
        description="Transport shipment weight in kilograms.",
    )
    ship_type: Literal["small", "medium", "large"] = Field(default="small")
    cargo_weight_mt: float = Field(default=0.0, ge=0.0)


class CorridorProfileRequest(BaseModel):
    origin_locode: str
    dest_locode: str
    dest_country: str = Field(
        min_length=2,
        max_length=2,
        description="ISO2 destination country code, for example IN, AE, LK.",
    )
    distance_nm: float = Field(gt=0)
    commodity: str = Field(default="Default")


class DisruptionUpdateRequest(BaseModel):
    corridor_id: Optional[int] = Field(default=None)
    corridor_name: Optional[str] = Field(default=None)
    origin: Optional[str] = Field(default=None)
    destination: Optional[str] = Field(default=None)
    disruption_type: str = Field(
        min_length=1,
        description="v7 disruption label: none|port_congestion|severe_weather|geopolitical",
    )
    source: str = Field(default="ops-signal")
    observed_at: Optional[datetime] = Field(default=None)
    meta: Dict[str, Any] = Field(default_factory=dict)


class GeopoliticalRiskUpdateRequest(BaseModel):
    corridor_id: Optional[int] = Field(default=None)
    corridor_name: Optional[str] = Field(default=None)
    origin: Optional[str] = Field(default=None)
    destination: Optional[str] = Field(default=None)
    geopolitical_risk: float = Field(
        ge=0.0,
        le=1.0,
        description="Live geopolitical risk index in [0,1]",
    )
    source: str = Field(default="ops-risk")
    observed_at: Optional[datetime] = Field(default=None)
    meta: Dict[str, Any] = Field(default_factory=dict)


class AppState:
    xgb_model: Any = None
    q_table: Dict[str, Any] = {}
    pipeline_config: Dict[str, Any] = {}
    feature_order: List[str] = []
    corridor_map: Dict[int, str] = {}
    corridor_name_to_id: Dict[str, int] = {}
    corridor_geo_risk: Dict[int, float] = {}
    corridor_route_type_enc: Dict[int, int] = {}
    weather_thresholds: Dict[str, List[float]] = {}
    weather_thresholds_normalized: Dict[str, List[float]] = {}
    disruption_enc_map: Dict[str, int] = {}
    congestion_threshold: float = 0.5
    update_type: str = ""
    band_low: float = 0.3
    band_moderate: float = 0.55
    action_meta: Dict[str, Dict[str, Any]] = {}
    air_action_meta: Dict[str, Dict[str, Any]] = {}
    cost_savings_sources: Dict[str, str] = {}
    latest_weather_by_corridor: Dict[int, Dict[str, Any]] = {}
    latest_disruption_by_corridor: Dict[int, Dict[str, Any]] = {}
    latest_wind_by_corridor: Dict[int, Dict[str, Any]] = {}
    latest_headlines_by_corridor: Dict[int, Dict[str, Any]] = {}
    latest_usd_inflation: Dict[str, Any] = {}
    latest_lead_time_by_corridor: Dict[int, Dict[str, Any]] = {}
    latest_geopolitical_risk_by_corridor: Dict[int, Dict[str, Any]] = {}
    corridor_profiles: Dict[str, Dict[str, Any]] = {}
    markov_focus_corridor_ids: List[int] = []
    markov_focus_route_keys: List[str] = []


state = AppState()


REGION_RISK_LOOKUP = {
    "AE": 0.72,
    "AU": 0.22,
    "BR": 0.42,
    "DK": 0.20,
    "IN": 0.50,
    "KR": 0.25,
    "LK": 0.35,
    "NL": 0.20,
    "DE": 0.18,
    "CN": 0.45,
    "JP": 0.25,
    "SN": 0.52,
    "US": 0.22,
    "SG": 0.30,
    "GB": 0.20,
}


COMMODITY_WEIGHT_AVG = {
    "Default": 6500,
    "Electronics": 4200,
    "Apparel": 3600,
    "AutoParts": 7800,
    "Chemicals": 9200,
    "Food": 5400,
}


CORRIDOR_MAP_DEFAULT = {
    0: "HAM→NYC",
    1: "MUM→FXT",
    2: "SAN→SHA",
    3: "SHA→LAX",
    4: "TOK→SIN",
    5: "SIN→CMB",
    6: "SIN→JEA",
    7: "SIN→MUN",
    8: "SIN→NSA",
    9: "SIN→RTM",
    10: "SIN→PUS",
    11: "JEA→RTM",
    12: "SHA→RTM",
    13: "MUM→CMB",
    14: "SIN→DKR",
    15: "SIN→SYD",
    16: "JEA→NYC",
    17: "SHA→PUS",
    18: "SHZ→RTM",
    19: "MUM→JEA",
}


CORRIDOR_GEO_RISK_DEFAULT = {
    0: 0.30,
    1: 0.68,
    2: 0.42,
    3: 0.40,
    4: 0.28,
    5: 0.35,
    6: 0.72,
    7: 0.55,
    8: 0.50,
    9: 0.55,
    10: 0.25,
    11: 0.65,
    12: 0.58,
    13: 0.40,
    14: 0.52,
    15: 0.32,
    16: 0.70,
    17: 0.30,
    18: 0.62,
    19: 0.58,
}


SHIP_SPECS: Dict[str, Dict[str, float]] = {
    "small": {"lwt": 2500.0, "max_cargo_mt": 5600.0},
    "medium": {"lwt": 10000.0, "max_cargo_mt": 30000.0},
    "large": {"lwt": 25000.0, "max_cargo_mt": 96000.0},
}


ROUTE_SHIP_BASELINES: Dict[str, Dict[str, Dict[str, float]]] = {
    "TOK→SIN": {
        "small": {"fuel_0": 41.22, "co2_0": 128.36, "fuel_cost_0": 2473.20, "co2_saved": 0.0, "cost_saved": 0.0},
        "medium": {"fuel_0": 205.95, "co2_0": 641.33, "fuel_cost_0": 12357.00, "co2_saved": 0.0, "cost_saved": 0.0},
        "large": {"fuel_0": 633.27, "co2_0": 1972.00, "fuel_cost_0": 37996.20, "co2_saved": 0.0, "cost_saved": 0.0},
    },
    "SHA→PUS": {
        "small": {"fuel_0": 10.87, "co2_0": 33.85, "fuel_cost_0": 652.20, "co2_saved": 0.0, "cost_saved": 0.0},
        "medium": {"fuel_0": 54.30, "co2_0": 169.09, "fuel_cost_0": 3258.00, "co2_saved": 0.0, "cost_saved": 0.0},
        "large": {"fuel_0": 166.95, "co2_0": 519.88, "fuel_cost_0": 10017.00, "co2_saved": 0.0, "cost_saved": 0.0},
    },
    "SIN→JEA": {
        "small": {"fuel_0": 38.32, "co2_0": 119.33, "fuel_cost_0": 2299.20, "co2_saved": 224.5, "cost_saved": 3200.0},
        "medium": {"fuel_0": 153.28, "co2_0": 477.31, "fuel_cost_0": 9196.80, "co2_saved": 1122.5, "cost_saved": 3200.0},
        "large": {"fuel_0": 383.19, "co2_0": 1193.25, "fuel_cost_0": 22991.40, "co2_saved": 5459.1, "cost_saved": 3200.0},
    },
    "MUM→JEA": {
        "small": {"fuel_0": 17.00, "co2_0": 52.94, "fuel_cost_0": 1020.00, "co2_saved": 99.6, "cost_saved": 3200.0},
        "medium": {"fuel_0": 67.99, "co2_0": 211.72, "fuel_cost_0": 4079.40, "co2_saved": 497.9, "cost_saved": 3200.0},
        "large": {"fuel_0": 169.98, "co2_0": 529.32, "fuel_cost_0": 10198.80, "co2_saved": 2421.6, "cost_saved": 3200.0},
    },
    "SHZ→RTM": {
        "small": {"fuel_0": 345.42, "co2_0": 1075.64, "fuel_cost_0": 20725.20, "co2_saved": 8.6, "cost_saved": 12400.0},
        "medium": {"fuel_0": 1381.69, "co2_0": 4302.58, "fuel_cost_0": 82901.40, "co2_saved": 8.6, "cost_saved": 12400.0},
        "large": {"fuel_0": 3454.22, "co2_0": 10756.44, "fuel_cost_0": 207253.20, "co2_saved": 8.6, "cost_saved": 12400.0},
    },
    "SIN→SYD": {
        "small": {"fuel_0": 95.17, "co2_0": 296.36, "fuel_cost_0": 5710.20, "co2_saved": 6.0, "cost_saved": 12400.0},
        "medium": {"fuel_0": 380.70, "co2_0": 1185.50, "fuel_cost_0": 22842.00, "co2_saved": 6.0, "cost_saved": 12400.0},
        "large": {"fuel_0": 951.74, "co2_0": 2963.72, "fuel_cost_0": 57104.40, "co2_saved": 6.0, "cost_saved": 12400.0},
    },
}


def _load_xgb_model() -> Any:
    model_json_path = _first_existing_path(XGB_MODEL_JSON_CANDIDATES)
    if model_json_path is not None:
        model = xgb.XGBClassifier()
        model.load_model(str(model_json_path))
        return model

    expected = [p.name for p in XGB_MODEL_JSON_CANDIDATES]
    raise RuntimeError(f"Missing model file. Expected one of: {', '.join(expected)}")


def _load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _softmax_confidence(values: List[float], best_idx: int) -> float:
    arr = np.array(values, dtype=float)
    arr = arr - np.max(arr)
    exp = np.exp(arr)
    probs = exp / np.sum(exp)
    return float(probs[best_idx])


def _resolve_corridor_id(corridor_id: Optional[int], corridor_name: Optional[str]) -> int:
    if corridor_id is not None:
        if corridor_id not in state.corridor_map:
            allowed_ids = ",".join(str(i) for i in sorted(state.corridor_map.keys()))
            raise HTTPException(status_code=400, detail=f"corridor_id must be one of {allowed_ids}")
        return corridor_id

    if not corridor_name:
        raise HTTPException(status_code=400, detail="Provide corridor_id or corridor_name")

    if corridor_name not in state.corridor_name_to_id:
        allowed = ", ".join(state.corridor_name_to_id.keys())
        raise HTTPException(status_code=400, detail=f"Unknown corridor_name. Allowed: {allowed}")

    return state.corridor_name_to_id[corridor_name]


def _normalize_location_name(value: str) -> str:
    return "".join(value.lower().split())


def _normalize_corridor_name(value: str) -> str:
    normalized = value.strip().replace("->", "→")
    if "→" not in normalized:
        return _normalize_location_name(normalized)

    origin, destination = normalized.split("→", 1)
    return f"{_normalize_location_name(origin)}→{_normalize_location_name(destination)}"


def _build_route_key(origin: str, destination: str) -> str:
    return f"{origin.upper()}->{destination.upper()}"


def _normalize_disruption_type(value: Optional[str]) -> str:
    if not value:
        return "none"
    normalized = value.strip().lower().replace("-", "_").replace(" ", "_")
    return normalized


def _normalize_ship_type(value: str) -> str:
    normalized = value.strip().lower()
    if normalized not in SHIP_SPECS:
        allowed = ", ".join(sorted(SHIP_SPECS.keys()))
        raise HTTPException(status_code=400, detail=f"ship_type must be one of {allowed}")
    return normalized


def _compute_ship_kpis(corridor_name: str, ship_type: str, cargo_weight_mt: float) -> Dict[str, Any]:
    normalized_ship = _normalize_ship_type(ship_type)
    specs = SHIP_SPECS[normalized_ship]
    lwt = float(specs["lwt"])
    max_cargo_mt = float(specs["max_cargo_mt"])

    bounded_cargo_mt = max(0.0, min(float(cargo_weight_mt), max_cargo_mt))

    baselines_for_route = ROUTE_SHIP_BASELINES.get(corridor_name)
    if baselines_for_route is None:
        baselines_for_route = ROUTE_SHIP_BASELINES.get("TOK→SIN", {})

    base = baselines_for_route.get(normalized_ship)
    if base is None:
        base = next(iter(baselines_for_route.values()), {
            "fuel_0": 0.0,
            "co2_0": 0.0,
            "fuel_cost_0": 0.0,
            "co2_saved": 0.0,
            "cost_saved": 0.0,
        })

    multiplier = 1.0 + (bounded_cargo_mt / lwt)

    fuel_mt = float(base["fuel_0"]) * multiplier
    co2_tco2 = float(base["co2_0"]) * multiplier
    fuel_cost_usd = float(base["fuel_cost_0"]) * multiplier

    return {
        "ship_type": normalized_ship,
        "cargo_weight_mt": round(bounded_cargo_mt, 3),
        "fuel_mt": round(fuel_mt, 2),
        "co2_tco2": round(co2_tco2, 2),
        "fuel_cost_usd": round(fuel_cost_usd, 2),
        "co2_saved_tco2": round(float(base["co2_saved"]), 2),
        "cost_saved_usd": round(float(base["cost_saved"]), 2),
    }


def _reroute_options_for_corridor(corridor_name: str, action_label: str) -> List[RerouteOption]:
    if action_label != "Reroute":
        return []

    options: List[Dict[str, Any]] = []

    if corridor_name == "SIN→SYD":
        options = [
            {
                "option_id": "R1",
                "label": "Maintain Stream via Darwin-Brisbane",
                "eta_days": 21,
                "waypoints": [
                    {"port": "Singapore", "lat": 1.2640, "lon": 103.8400},
                    {"port": "Jakarta", "lat": -6.10, "lon": 106.80},
                    {"port": "Darwin", "lat": -12.45, "lon": 130.85},
                    {"port": "Brisbane", "lat": -27.47, "lon": 153.03},
                    {"port": "Sydney", "lat": -33.8688, "lon": 151.2093},
                ],
            },
            {
                "option_id": "R2",
                "label": "ALT1 via Surabaya-Perth-Melbourne",
                "eta_days": 24,
                "waypoints": [
                    {"port": "Singapore", "lat": 1.2640, "lon": 103.8400},
                    {"port": "Surabaya", "lat": -7.25, "lon": 112.75},
                    {"port": "Perth", "lat": -31.95, "lon": 115.86},
                    {"port": "Melbourne", "lat": -37.81, "lon": 144.96},
                    {"port": "Sydney", "lat": -33.8688, "lon": 151.2093},
                ],
            },
            {
                "option_id": "R3",
                "label": "ALT2 via Colombo-Fremantle-Adelaide",
                "eta_days": 26,
                "waypoints": [
                    {"port": "Singapore", "lat": 1.2640, "lon": 103.8400},
                    {"port": "Colombo", "lat": 6.93, "lon": 79.86},
                    {"port": "Fremantle", "lat": -32.06, "lon": 115.74},
                    {"port": "Adelaide", "lat": -34.93, "lon": 138.60},
                    {"port": "Sydney", "lat": -33.8688, "lon": 151.2093},
                ],
            },
        ]
    elif corridor_name == "SHZ→RTM":
        options = [
            {
                "option_id": "R1",
                "label": "R1 via Suez Canal",
                "eta_days": 29,
                "waypoints": [
                    {"port": "Shenzhen", "lat": 22.5431, "lon": 114.0579},
                    {"port": "Singapore", "lat": 1.2640, "lon": 103.8400},
                    {"port": "Colombo", "lat": 6.93, "lon": 79.86},
                    {"port": "Jeddah", "lat": 21.4858, "lon": 39.1925},
                    {"port": "Suez Canal", "lat": 30.50, "lon": 32.30},
                    {"port": "Rotterdam", "lat": 51.9244, "lon": 4.4777},
                ],
            },
            {
                "option_id": "R2",
                "label": "R2 via Cape Town-Dakar",
                "eta_days": 36,
                "waypoints": [
                    {"port": "Shenzhen", "lat": 22.5431, "lon": 114.0579},
                    {"port": "Singapore", "lat": 1.2640, "lon": 103.8400},
                    {"port": "Colombo", "lat": 6.93, "lon": 79.86},
                    {"port": "Cape Town", "lat": -33.9249, "lon": 18.4241},
                    {"port": "Dakar", "lat": 14.7167, "lon": -17.4677},
                    {"port": "Rotterdam", "lat": 51.9244, "lon": 4.4777},
                ],
            },
            {
                "option_id": "R3",
                "label": "R3 via Mumbai-Mombasa-Lagos",
                "eta_days": 38,
                "waypoints": [
                    {"port": "Shenzhen", "lat": 22.5431, "lon": 114.0579},
                    {"port": "Singapore", "lat": 1.2640, "lon": 103.8400},
                    {"port": "Mumbai", "lat": 19.0760, "lon": 72.8777},
                    {"port": "Mombasa", "lat": -4.0435, "lon": 39.6682},
                    {"port": "Lagos", "lat": 6.5244, "lon": 3.3792},
                    {"port": "Rotterdam", "lat": 51.9244, "lon": 4.4777},
                ],
            },
        ]
    else:
        return []

    return [RerouteOption(**item) for item in options]


def _storm_regions_for_corridor(corridor_name: str, weather_driven_reroute: bool) -> List[StormRegion]:
    if not weather_driven_reroute:
        return []

    if corridor_name == "SIN→SYD":
        return [
            StormRegion(
                name="Cyclone Zone",
                boundary=[
                    StormPoint(lat=-10.4, lon=123.8),
                    StormPoint(lat=-10.4, lon=153.8),
                    StormPoint(lat=-20.6, lon=153.8),
                    StormPoint(lat=-20.6, lon=123.8),
                ],
            ),
        ]

    return []


def _resolve_disruption_enc(
    corridor_id: int,
    disruption_type: Optional[str],
    disruption_event_enc: Optional[int],
) -> int:
    if disruption_event_enc is not None:
        if 0 <= disruption_event_enc <= 3:
            return int(disruption_event_enc)
        raise HTTPException(status_code=400, detail="disruption_event_enc must be in [0,3]")

    if disruption_type:
        key = _normalize_disruption_type(disruption_type)
        if key not in state.disruption_enc_map:
            allowed = ", ".join(sorted(state.disruption_enc_map.keys()))
            raise HTTPException(status_code=400, detail=f"Unknown disruption_type. Allowed: {allowed}")
        return int(state.disruption_enc_map[key])

    stored = state.latest_disruption_by_corridor.get(corridor_id)
    if stored:
        return int(stored.get("disruption_event_enc", 0))

    return 0


def _get_geopolitical_risk_for_corridor(corridor_id: int) -> float:
    live = state.latest_geopolitical_risk_by_corridor.get(corridor_id)
    if live and "geopolitical_risk" in live:
        return float(live["geopolitical_risk"])

    if corridor_id in state.corridor_geo_risk:
        return float(state.corridor_geo_risk[corridor_id])

    if corridor_id in CORRIDOR_GEO_RISK_DEFAULT:
        return float(CORRIDOR_GEO_RISK_DEFAULT[corridor_id])

    country = None
    corridor_name = state.corridor_map.get(corridor_id, "")
    if "→" in corridor_name:
        _, destination = corridor_name.split("→", 1)
        country_alias = {
            "cmb": "LK",
            "dkr": "SN",
            "fxt": "GB",
            "jea": "AE",
            "mun": "IN",
            "nsa": "IN",
            "nyc": "US",
            "pus": "KR",
            "rtm": "NL",
            "san": "BR",
            "sha": "CN",
            "shz": "CN",
            "syd": "AU",
            "colombo": "LK",
            "jebelali": "AE",
            "mundra": "IN",
            "nhavasheva": "IN",
            "rotterdam": "NL",
            "busan": "KR",
            "shanghai": "CN",
        }
        country = country_alias.get(_normalize_location_name(destination))

    if not country:
        return 0.45
    return float(REGION_RISK_LOOKUP.get(country, 0.45))


def _derive_corridor_map_from_qtable(q_table: Dict[str, Any]) -> Dict[int, str]:
    derived: Dict[int, str] = {}
    for entry in q_table.values():
        state_index = entry.get("state_index")
        corridor_name = entry.get("corridor")
        if state_index is None or corridor_name is None:
            continue
        corridor_id = int(state_index) // 6
        if corridor_id not in derived:
            derived[corridor_id] = str(corridor_name)
    return derived


def _derive_markov_focus_from_demo_outputs(demo_outputs: List[Dict[str, Any]]) -> Tuple[List[str], List[str]]:
    corridor_names: List[str] = []
    route_keys: List[str] = []

    for item in demo_outputs:
        route_key = item.get("route_key")
        corridor_name = item.get("corridor_name")

        if isinstance(route_key, str) and route_key and route_key not in route_keys:
            route_keys.append(route_key)
        if isinstance(corridor_name, str) and corridor_name and corridor_name not in corridor_names:
            corridor_names.append(corridor_name)

    return corridor_names, route_keys


def _resolve_markov_focus_corridor_ids(
    corridor_map: Dict[int, str],
    focus_names: List[str],
) -> List[int]:
    normalized_to_id = {
        _normalize_corridor_name(corridor_name): corridor_id
        for corridor_id, corridor_name in corridor_map.items()
    }

    resolved: List[int] = []
    for corridor_name in focus_names:
        corridor_id = normalized_to_id.get(_normalize_corridor_name(corridor_name))
        if corridor_id is not None and corridor_id not in resolved:
            resolved.append(corridor_id)
    return resolved


def _resolve_corridor_id_from_route(origin: str, destination: str) -> int:
    origin_norm = _normalize_location_name(origin)
    destination_norm = _normalize_location_name(destination)

    for corridor_id, corridor_name in state.corridor_map.items():
        if "→" not in corridor_name:
            continue
        start, end = corridor_name.split("→", 1)
        if _normalize_location_name(start) == origin_norm and _normalize_location_name(end) == destination_norm:
            return corridor_id

    allowed = ", ".join(state.corridor_map.values())
    raise HTTPException(
        status_code=400,
        detail=f"Unknown route pair. Allowed corridors: {allowed}",
    )


def _resolve_corridor_id_any(
    corridor_id: Optional[int],
    corridor_name: Optional[str],
    origin: Optional[str],
    destination: Optional[str],
) -> int:
    if corridor_id is not None or corridor_name:
        return _resolve_corridor_id(corridor_id, corridor_name)

    if origin and destination:
        return _resolve_corridor_id_from_route(origin, destination)

    raise HTTPException(
        status_code=400,
        detail="Provide corridor_id/corridor_name or origin+destination",
    )


def _weather_level_from_raw(weather_raw: float) -> int:
    thresholds = state.weather_thresholds

    # Config may expose raw (0-10) and normalized (0-1) thresholds; API payload uses normalized values.
    clear_upper = thresholds.get("Clear", [0.0, 0.33])[1]
    if clear_upper > 1.0:
        thresholds = state.weather_thresholds_normalized or {
            "Clear": [0.0, 0.33],
            "Moderate": [0.33, 0.66],
        }

    clear = thresholds.get("Clear", [0.0, 0.33])
    moderate = thresholds.get("Moderate", [0.33, 0.66])

    if clear[0] <= weather_raw < clear[1]:
        return 0
    if moderate[0] <= weather_raw < moderate[1]:
        return 1
    return 2


def _build_feature_vector(
    corridor_id: int,
    weather_severity_raw: float,
    geopolitical_risk: float,
    inflation_rate: float,
    base_lead_time: int,
    transport_mode_enc: int,
    disruption_event_enc: int,
    order_weight_kg: int,
) -> np.ndarray:
    route_type_enc = int(state.corridor_route_type_enc.get(corridor_id, corridor_id))

    # Match notebook v7 behavior for moderate port congestion scenarios.
    # This keeps advisory-level congestion from being over-amplified on sub-crisis corridors.
    disruption_feature = float(disruption_event_enc)
    if int(disruption_event_enc) == int(state.disruption_enc_map.get("port_congestion", 1)) and geopolitical_risk < 0.55:
        dampening_factor = max(0.0, (0.55 - geopolitical_risk) / 0.55)
        disruption_feature = max(0.3, disruption_feature * (1.0 - 3.0 * dampening_factor))

    congestion_score = (geopolitical_risk + disruption_feature / 3.0) / 2.0

    values = {
        "Geopolitical_Risk_Index": geopolitical_risk,
        "Weather_Severity_Index": weather_severity_raw,
        "Weather_Severity_Norm": weather_severity_raw,
        "Inflation_Rate_Pct": inflation_rate,
        "Base_Lead_Time_Days": base_lead_time,
        "Transportation_Mode_Enc": transport_mode_enc,
        "Route_Type_Enc": route_type_enc,
        "Disruption_Event_Enc": disruption_feature,
        "Order_Weight_Kg": order_weight_kg,
        "Congestion_Score": congestion_score,
    }

    ordered = [values[k] for k in state.feature_order]
    return np.array([ordered], dtype=float)


def _query_qtable(state_index: int) -> Dict[str, Any]:
    key = None
    for k, entry in state.q_table.items():
        if int(entry.get("state_index", -1)) == state_index:
            key = k
            break

    if key is None:
        # Fallback for q_table_v3_final.json shape where key is c_w_cg and no explicit state_index.
        corridor = state_index // 6
        rem = state_index % 6
        weather = rem // 2
        congestion = rem % 2
        key = f"{corridor}_{weather}_{congestion}"

    if key not in state.q_table:
        raise HTTPException(status_code=500, detail="State not found in Q-table")

    return state.q_table[key]


def _transport_mode_label(transport_mode_enc: int) -> str:
    return {
        1: "SEA",
        2: "AIR",
        3: "RAIL",
        4: "ROAD",
    }.get(transport_mode_enc, "SEA")


def _action_display_label(action_label: str, transport_mode_enc: int) -> str:
    if _transport_mode_label(transport_mode_enc) != "AIR":
        return action_label

    mapping = {
        "Slow Steam": "Hold at Hub",
        "Reroute": "Reroute Flight",
    }
    return mapping.get(action_label, action_label)


def _fallback_wind_from_weather(weather_severity_raw: float) -> float:
    return round(12.0 + (weather_severity_raw * 58.0), 2)


def _sea_state_from_wind(wind_kmh: float) -> str:
    if wind_kmh < 15:
        return "Calm"
    if wind_kmh < 30:
        return "Choppy"
    if wind_kmh < 45:
        return "Rough"
    return "Storm"


def _visibility_from_weather(weather_name: str) -> str:
    mapping = {
        "Clear": "High",
        "Moderate": "Medium",
        "Severe": "Low",
    }
    return mapping.get(weather_name, "Medium")


def _confidence_interval(confidence: float, q_values: List[float], best_idx: int) -> ConfidenceIntervalPayload:
    sorted_vals = sorted(q_values, reverse=True)
    margin_from_gap = 0.05 if len(sorted_vals) < 2 else max(0.02, 0.22 - min(0.18, (sorted_vals[0] - sorted_vals[1]) / 100.0))
    lower = max(0.0, round(confidence - margin_from_gap, 4))
    upper = min(1.0, round(confidence + margin_from_gap, 4))
    return ConfidenceIntervalPayload(lower=lower, upper=upper, method="q-gap-approx")


def _alert_reason(action_label: str, explanation: List[str]) -> str:
    if action_label == "Reroute":
        if explanation:
            return "High risk: " + " & ".join(explanation[:2])
        return "High risk corridor conditions"
    if explanation:
        return explanation[0]
    return "Operationally stable"


def _savings_for_action(action_label: str, congestion_probability: float, transport_mode_enc: int) -> Dict[str, float]:
    action_meta = state.air_action_meta if _transport_mode_label(transport_mode_enc) == "AIR" else state.action_meta
    action_lookup = {
        "Maintain Course": action_meta.get("0", {}),
        "Slow Steam": action_meta.get("1", {}),
        "Reroute": action_meta.get("2", {}),
    }
    meta = action_lookup.get(action_label, {})

    scale = congestion_probability + 0.3
    return {
        "delay_saved_hours": round(float(meta.get("delay_saved", 0.0)) * scale, 2),
        "cost_saved_usd": round(float(meta.get("cost_saved", 0.0)) * scale, 2),
        "carbon_saved_tco2": round(float(meta.get("carbon_saved", 0.0)) * scale, 2),
    }


def _disruption_label_from_enc(value: int) -> str:
    for label, enc in state.disruption_enc_map.items():
        if int(enc) == int(value):
            return label
    return "none"


def estimate_lead_time(distance_nm: float, avg_speed_knots: float = 15.0, port_buffer_days: float = 1.0) -> int:
    travel_days = distance_nm / avg_speed_knots / 24.0
    return max(1, int(math.ceil(travel_days + port_buffer_days)))


async def build_corridor_profile(
    origin_locode: str,
    dest_locode: str,
    dest_country: str,
    distance_nm: float,
    commodity: str = "Default",
) -> Dict[str, Any]:
    """
    Dynamically builds a corridor profile for any route.
    Only needs 4 inputs; everything else is derived from backend state.
    """
    country = dest_country.upper()
    inflation = float(state.latest_usd_inflation.get("inflation_rate", 3.5))

    lead_time = estimate_lead_time(distance_nm)
    weight = int(COMMODITY_WEIGHT_AVG.get(commodity, COMMODITY_WEIGHT_AVG["Default"]))
    geo_risk = float(REGION_RISK_LOOKUP.get(country, 0.45))

    return {
        "corridor_id": None,
        "transport_mode_enc": 1,
        "base_lead_time": lead_time,
        "inflation_rate": round(float(inflation), 2),
        "order_weight_kg": weight,
        "geopolitical_risk": geo_risk,
        "distance_nm": distance_nm,
        "origin": origin_locode.upper(),
        "destination": dest_locode.upper(),
        "dest_country": country,
        "commodity": commodity,
    }


def _infer_from_values(
    corridor_id: int,
    weather_severity_raw: float,
    geopolitical_risk: float,
    inflation_rate: float = 3.0,
    base_lead_time: int = 12,
    transport_mode_enc: int = 1,
    disruption_event_enc: int = 0,
    order_weight_kg: int = 5000,
    ship_type: str = "small",
    cargo_weight_mt: float = 0.0,
) -> InferenceResponse:
    features = _build_feature_vector(
        corridor_id=corridor_id,
        weather_severity_raw=weather_severity_raw,
        geopolitical_risk=geopolitical_risk,
        inflation_rate=inflation_rate,
        base_lead_time=base_lead_time,
        transport_mode_enc=transport_mode_enc,
        disruption_event_enc=disruption_event_enc,
        order_weight_kg=order_weight_kg,
    )
    congestion_probability = float(state.xgb_model.predict_proba(features)[0, 1])
    congestion_probability = round(congestion_probability, 4)
    explanation = []

    if weather_severity_raw > 0.7:
        explanation.append("Severe weather detected")

    if geopolitical_risk > 0.6:
        explanation.append("High geopolitical risk")

    disruption_label = _disruption_label_from_enc(disruption_event_enc)
    if disruption_label == "geopolitical":
        explanation.append("Geopolitical disruption signal")
    elif disruption_label == "severe_weather":
        explanation.append("Severe weather disruption signal")
    elif disruption_label == "port_congestion":
        explanation.append("Port congestion disruption signal")

    if congestion_probability > 0.8:
        explanation.append("High congestion probability")

    weather_level = _weather_level_from_raw(weather_severity_raw)
    congestion_level = 1 if congestion_probability >= state.congestion_threshold else 0
    state_index = corridor_id * 6 + weather_level * 2 + congestion_level

    q_entry = _query_qtable(state_index)
    q_values_raw = q_entry.get("q_values", {})
    if not q_values_raw:
        raise HTTPException(status_code=500, detail="Q-table entry has no q_values")

    ordered_keys = ["Maintain Course", "Slow Steam", "Reroute"]
    value_candidates = [
        float(q_values_raw.get("Maintain Course", q_values_raw.get("maintain_course", float("-inf")))),
        float(q_values_raw.get("Slow Steam", q_values_raw.get("slow_steam", float("-inf")))),
        float(q_values_raw.get("Reroute", q_values_raw.get("reroute", float("-inf")))),
    ]

    best_idx = int(np.argmax(value_candidates))
    action_label = ordered_keys[best_idx]
    confidence = round(_softmax_confidence(value_candidates, best_idx), 4)
    confidence_interval = _confidence_interval(confidence, value_candidates, best_idx)

    savings = _savings_for_action(action_label, congestion_probability, transport_mode_enc)

    q_values = {
        "Maintain Course": round(value_candidates[0], 4),
        "Slow Steam": round(value_candidates[1], 4),
        "Reroute": round(value_candidates[2], 4),
    }

    corridor_name = state.corridor_map[corridor_id]
    weather_name = ["Clear", "Moderate", "Severe"][weather_level]
    congestion_name = ["Low", "High"][congestion_level]
    wind_state = state.latest_wind_by_corridor.get(corridor_id, {})
    wind_kmh = round(float(wind_state.get("wind_kmh", _fallback_wind_from_weather(weather_severity_raw))), 2)
    sea_state = _sea_state_from_wind(wind_kmh)
    visibility = _visibility_from_weather(weather_name)
    alert_reason = _alert_reason(action_label, explanation)
    headlines_state = state.latest_headlines_by_corridor.get(corridor_id, {})
    headlines_payload = headlines_state.get("headlines", [])
    response_headlines = [HeadlineItem(**h) for h in headlines_payload[:3]]

    if not explanation:
        explanation.append("Conditions are stable, no rerouting required")

    ship_metrics = _compute_ship_kpis(
        corridor_name=corridor_name,
        ship_type=ship_type,
        cargo_weight_mt=cargo_weight_mt,
    )
    reroute_options = _reroute_options_for_corridor(corridor_name, action_label)
    is_weather_driven_reroute = action_label == "Reroute" and (
        weather_severity_raw >= 0.7 or disruption_label == "severe_weather"
    )
    storm_regions = _storm_regions_for_corridor(corridor_name, is_weather_driven_reroute)

    return InferenceResponse(
        action=action_label,
        action_display=_action_display_label(action_label, transport_mode_enc),
        confidence=confidence,
        confidence_interval=confidence_interval,
        congestion_probability=congestion_probability,
        explanation=explanation,
        congestion_level=congestion_name,
        delay_saved_hours=savings["delay_saved_hours"],
        cost_saved_usd=ship_metrics["cost_saved_usd"],
        carbon_saved_tco2=ship_metrics["co2_saved_tco2"],
        transport_mode_enc=transport_mode_enc,
        transport_mode_label=_transport_mode_label(transport_mode_enc),
        wind_kmh=wind_kmh,
        sea_state=sea_state,
        visibility=visibility,
        alert_reason=alert_reason,
        state=StatePayload(
            index=state_index,
            corridor=corridor_name,
            weather=weather_name,
            congestion=congestion_name,
        ),
        q_values=q_values,
        headlines=response_headlines,
        reroute_options=reroute_options,
        storm_regions=storm_regions,
        ship_type=ship_metrics["ship_type"],
        cargo_weight_mt=ship_metrics["cargo_weight_mt"],
        fuel_mt=ship_metrics["fuel_mt"],
        co2_tco2=ship_metrics["co2_tco2"],
        fuel_cost_usd=ship_metrics["fuel_cost_usd"],
    )


def _load_artifacts() -> None:
    searched_dirs = ", ".join(str(path) for path in OUTPUTS_DIR_CANDIDATES)

    if _first_existing_path(XGB_MODEL_JSON_CANDIDATES) is None:
        expected = [p.name for p in XGB_MODEL_JSON_CANDIDATES]
        raise RuntimeError(f"Missing model file in [{searched_dirs}]. Expected one of: {', '.join(expected)}")

    q_table_path = _first_existing_path(Q_TABLE_CANDIDATES)
    if q_table_path is None:
        expected = [p.name for p in Q_TABLE_CANDIDATES]
        raise RuntimeError(f"Missing Q-table file in [{searched_dirs}]. Expected one of: {', '.join(expected)}")

    pipeline_config_path = _first_existing_path(PIPELINE_CONFIG_CANDIDATES)
    if pipeline_config_path is None:
        expected = [p.name for p in PIPELINE_CONFIG_CANDIDATES]
        raise RuntimeError(f"Missing config file in [{searched_dirs}]. Expected one of: {', '.join(expected)}")

    state.xgb_model = _load_xgb_model()
    state.q_table = _load_json(q_table_path)
    state.pipeline_config = _load_json(pipeline_config_path)

    state.feature_order = state.pipeline_config.get("feature_order", [])
    if not state.feature_order:
        raise RuntimeError("pipeline_config.json missing feature_order")

    raw_corridor_map = state.pipeline_config.get("corridor_map", {})
    corridor_map_from_config = {int(k): v for k, v in raw_corridor_map.items()}
    corridor_map_from_qtable = _derive_corridor_map_from_qtable(state.q_table)

    # Start from built-in defaults, then overlay artifact values.
    merged_corridors = dict(CORRIDOR_MAP_DEFAULT)
    merged_corridors.update(corridor_map_from_qtable)
    merged_corridors.update(corridor_map_from_config)

    state.corridor_map = merged_corridors
    state.corridor_name_to_id = {v: k for k, v in state.corridor_map.items()}

    raw_geo_risk = state.pipeline_config.get("corridor_geo_risk", {})
    state.corridor_geo_risk = {int(k): float(v) for k, v in raw_geo_risk.items()}

    raw_route_type = state.pipeline_config.get("corridor_route_type_enc", {})
    state.corridor_route_type_enc = {int(k): int(v) for k, v in raw_route_type.items()}

    state.weather_thresholds = state.pipeline_config.get("weather_thresholds", {})
    state.weather_thresholds_normalized = state.pipeline_config.get("weather_thresholds_normalized", {})
    raw_disruption_map = state.pipeline_config.get("disruption_enc_map", DISRUPTION_ENC_MAP_DEFAULT)
    state.disruption_enc_map = {
        _normalize_disruption_type(str(k)): int(v) for k, v in raw_disruption_map.items()
    }
    if not state.disruption_enc_map:
        state.disruption_enc_map = dict(DISRUPTION_ENC_MAP_DEFAULT)
    state.congestion_threshold = float(state.pipeline_config.get("congestion_threshold", 0.5))
    state.update_type = str(state.pipeline_config.get("update_type", ""))
    state.band_low = float(state.pipeline_config.get("band_low", 0.3))
    state.band_moderate = float(state.pipeline_config.get("band_moderate", 0.55))
    state.action_meta = state.pipeline_config.get("action_meta", {})
    state.air_action_meta = state.pipeline_config.get("air_action_meta", state.action_meta)
    state.cost_savings_sources = state.pipeline_config.get("cost_savings_sources", {})

    demo_outputs_path = _first_existing_path(DEMO_OUTPUTS_CANDIDATES)
    focus_names = list(MARKOV_FOCUS_CORRIDOR_NAMES_DEFAULT)
    focus_route_keys: List[str] = list(MARKOV_FOCUS_ROUTE_KEYS_DEFAULT)
    if demo_outputs_path is not None:
        try:
            raw_demo_outputs = _load_json(demo_outputs_path)
            if isinstance(raw_demo_outputs, list):
                derived_focus_names, derived_focus_route_keys = _derive_markov_focus_from_demo_outputs(raw_demo_outputs)
                if derived_focus_names:
                    focus_names = derived_focus_names
                if derived_focus_route_keys:
                    focus_route_keys = derived_focus_route_keys
        except Exception:
            # Non-fatal: keep defaults if demo outputs are unavailable or malformed.
            pass

    resolved_focus_ids = _resolve_markov_focus_corridor_ids(state.corridor_map, focus_names)
    if len(resolved_focus_ids) != len(MARKOV_FOCUS_CORRIDOR_NAMES_DEFAULT):
        resolved_focus_ids = _resolve_markov_focus_corridor_ids(
            state.corridor_map,
            MARKOV_FOCUS_CORRIDOR_NAMES_DEFAULT,
        )

    state.markov_focus_corridor_ids = resolved_focus_ids
    state.markov_focus_route_keys = focus_route_keys


@asynccontextmanager
async def lifespan(_: FastAPI):
    _load_artifacts()
    yield


app = FastAPI(title=APP_TITLE, version=APP_VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/metadata")
def metadata() -> Dict[str, Any]:
    corridor_items: List[Dict[str, Any]] = []
    for corridor_id, corridor_name in sorted(state.corridor_map.items()):
        origin = ""
        destination = ""
        if "→" in corridor_name:
            origin, destination = corridor_name.split("→", 1)

        corridor_items.append(
            {
                "corridor_id": corridor_id,
                "corridor_name": corridor_name,
                "origin": origin,
                "destination": destination,
            }
        )

    all_corridor_ids = sorted(state.corridor_map.keys())
    markov_focus_ids = state.markov_focus_corridor_ids
    corridor_items_by_id = {item["corridor_id"]: item for item in corridor_items}
    markov_focus_items = [corridor_items_by_id[cid] for cid in markov_focus_ids if cid in corridor_items_by_id]

    return {
        "model_version": state.pipeline_config.get("model_version"),
        "model_auc": state.pipeline_config.get("model_auc"),
        "update_type": state.update_type,
        "feature_order": state.feature_order,
        "corridors_network_all": corridor_items,
        "corridors_markov_focus": markov_focus_items,
        "corridor_counts": {
            "network_all": len(corridor_items),
            "markov_focus": len(markov_focus_items),
        },
        "route_view_modes": {
            "network_all": {
                "frontend_mode": "DP World Network",
                "corridor_ids": all_corridor_ids,
            },
            "markov_focus": {
                "frontend_mode": "Markov Chained",
                "corridor_ids": markov_focus_ids,
                "route_keys": state.markov_focus_route_keys,
            },
        },
        "disruption_enc_map": state.disruption_enc_map,
        "weather_thresholds": state.weather_thresholds,
        "congestion_threshold": state.congestion_threshold,
        "band_low": state.band_low,
        "band_moderate": state.band_moderate,
        "cost_savings_sources": state.cost_savings_sources,
        "latest_weather_by_corridor": state.latest_weather_by_corridor,
        "latest_disruption_by_corridor": state.latest_disruption_by_corridor,
        "latest_wind_by_corridor": state.latest_wind_by_corridor,
        "latest_headlines_by_corridor": state.latest_headlines_by_corridor,
        "latest_usd_inflation": state.latest_usd_inflation,
        "latest_geopolitical_risk_by_corridor": state.latest_geopolitical_risk_by_corridor,
        "corridor_profiles": state.corridor_profiles,
    }


@app.post("/update/weather")
def update_weather(payload: WeatherUpdateRequest) -> Dict[str, Any]:
    corridor_id = _resolve_corridor_id_any(
        corridor_id=payload.corridor_id,
        corridor_name=payload.corridor_name,
        origin=payload.origin,
        destination=payload.destination,
    )

    observed_at = payload.observed_at or datetime.now(timezone.utc)
    state.latest_weather_by_corridor[corridor_id] = {
        "corridor": state.corridor_map[corridor_id],
        "weather_severity_raw": payload.weather_severity_raw,
        "source": payload.source,
        "observed_at": observed_at.isoformat(),
        "meta": payload.meta,
    }

    return {
        "status": "updated",
        "corridor_id": corridor_id,
        "corridor": state.corridor_map[corridor_id],
        "weather_severity_raw": payload.weather_severity_raw,
        "source": payload.source,
        "observed_at": observed_at.isoformat(),
    }


@app.post("/update/wind")
def update_wind(payload: WindUpdateRequest) -> Dict[str, Any]:
    corridor_id = _resolve_corridor_id_any(
        corridor_id=payload.corridor_id,
        corridor_name=payload.corridor_name,
        origin=payload.origin,
        destination=payload.destination,
    )

    observed_at = payload.observed_at or datetime.now(timezone.utc)
    state.latest_wind_by_corridor[corridor_id] = {
        "corridor": state.corridor_map[corridor_id],
        "wind_kmh": round(float(payload.wind_kmh), 2),
        "wind_direction": payload.wind_direction,
        "source": payload.source,
        "observed_at": observed_at.isoformat(),
        "meta": payload.meta,
    }

    return {
        "status": "updated",
        "corridor_id": corridor_id,
        **state.latest_wind_by_corridor[corridor_id],
    }


@app.post("/update/disruption")
def update_disruption(payload: DisruptionUpdateRequest) -> Dict[str, Any]:
    corridor_id = _resolve_corridor_id_any(
        corridor_id=payload.corridor_id,
        corridor_name=payload.corridor_name,
        origin=payload.origin,
        destination=payload.destination,
    )

    disruption_type = _normalize_disruption_type(payload.disruption_type)
    if disruption_type not in state.disruption_enc_map:
        allowed = ", ".join(sorted(state.disruption_enc_map.keys()))
        raise HTTPException(status_code=400, detail=f"Unknown disruption_type. Allowed: {allowed}")

    observed_at = payload.observed_at or datetime.now(timezone.utc)
    state.latest_disruption_by_corridor[corridor_id] = {
        "corridor": state.corridor_map[corridor_id],
        "disruption_type": disruption_type,
        "disruption_event_enc": int(state.disruption_enc_map[disruption_type]),
        "source": payload.source,
        "observed_at": observed_at.isoformat(),
        "meta": payload.meta,
    }

    return {
        "status": "updated",
        "corridor_id": corridor_id,
        **state.latest_disruption_by_corridor[corridor_id],
    }


@app.post("/update/geopolitical-risk")
def update_geopolitical_risk(payload: GeopoliticalRiskUpdateRequest) -> Dict[str, Any]:
    corridor_id = _resolve_corridor_id_any(
        corridor_id=payload.corridor_id,
        corridor_name=payload.corridor_name,
        origin=payload.origin,
        destination=payload.destination,
    )

    observed_at = payload.observed_at or datetime.now(timezone.utc)
    state.latest_geopolitical_risk_by_corridor[corridor_id] = {
        "corridor": state.corridor_map[corridor_id],
        "geopolitical_risk": round(float(payload.geopolitical_risk), 4),
        "source": payload.source,
        "observed_at": observed_at.isoformat(),
        "meta": payload.meta,
    }

    return {
        "status": "updated",
        "corridor_id": corridor_id,
        **state.latest_geopolitical_risk_by_corridor[corridor_id],
    }


@app.post("/update/headlines")
def update_headlines(payload: HeadlinesUpdateRequest) -> Dict[str, Any]:
    corridor_id = _resolve_corridor_id_any(
        corridor_id=payload.corridor_id,
        corridor_name=payload.corridor_name,
        origin=payload.origin,
        destination=payload.destination,
    )

    observed_at = payload.observed_at or datetime.now(timezone.utc)
    items = [
        {
            "title": item.title,
            "source": item.source,
            "url": item.url,
            "risk_score": round(float(item.risk_score), 4),
        }
        for item in payload.headlines[:10]
    ]

    state.latest_headlines_by_corridor[corridor_id] = {
        "corridor": state.corridor_map[corridor_id],
        "headlines": items,
        "source": payload.source,
        "observed_at": observed_at.isoformat(),
        "meta": payload.meta,
    }

    return {
        "status": "updated",
        "corridor_id": corridor_id,
        "corridor": state.corridor_map[corridor_id],
        "count": len(items),
        "observed_at": observed_at.isoformat(),
    }


@app.post("/update/inflation")
def update_inflation(payload: InflationUpdateRequest) -> Dict[str, Any]:
    if payload.currency.upper() != "USD":
        raise HTTPException(
            status_code=400,
            detail="Only USD inflation is supported.",
        )

    observed_at = payload.observed_at or datetime.now(timezone.utc)
    inflation_value = round(float(payload.inflation_rate), 2)
    state.latest_usd_inflation = {
        "currency": "USD",
        "inflation_rate": inflation_value,
        "source": payload.source,
        "observed_at": observed_at.isoformat(),
        "meta": payload.meta,
    }

    return {
        "status": "updated",
        **state.latest_usd_inflation,
    }


@app.post("/update/lead-time")
def update_lead_time(payload: LeadTimeUpdateRequest) -> Dict[str, Any]:
    corridor_id = _resolve_corridor_id_any(
        corridor_id=payload.corridor_id,
        corridor_name=payload.corridor_name,
        origin=payload.origin,
        destination=payload.destination,
    )

    if payload.base_lead_time is not None:
        lead_time = int(payload.base_lead_time)
        basis = "explicit"
    else:
        if payload.distance_nm is None:
            raise HTTPException(
                status_code=400,
                detail="Provide base_lead_time or distance_nm.",
            )
        lead_time = estimate_lead_time(float(payload.distance_nm))
        basis = "distance"

    observed_at = payload.observed_at or datetime.now(timezone.utc)
    state.latest_lead_time_by_corridor[corridor_id] = {
        "corridor": state.corridor_map[corridor_id],
        "base_lead_time": lead_time,
        "basis": basis,
        "source": payload.source,
        "observed_at": observed_at.isoformat(),
        "meta": payload.meta,
    }

    return {
        "status": "updated",
        "corridor_id": corridor_id,
        **state.latest_lead_time_by_corridor[corridor_id],
    }


@app.post("/update/corridor-profile")
async def update_corridor_profile(payload: CorridorProfileRequest) -> Dict[str, Any]:
    profile = await build_corridor_profile(
        origin_locode=payload.origin_locode,
        dest_locode=payload.dest_locode,
        dest_country=payload.dest_country,
        distance_nm=payload.distance_nm,
        commodity=payload.commodity,
    )

    route_key = _build_route_key(payload.origin_locode, payload.dest_locode)
    state.corridor_profiles[route_key] = profile

    return {
        "status": "updated",
        "route_key": route_key,
        "profile": profile,
    }


@app.post("/infer/route", response_model=InferenceResponse)
def infer_route(payload: RouteInferenceRequest) -> InferenceResponse:
    corridor_id = _resolve_corridor_id_any(
        corridor_id=payload.corridor_id,
        corridor_name=payload.corridor_name,
        origin=payload.origin,
        destination=payload.destination,
    )

    weather_state = state.latest_weather_by_corridor.get(corridor_id)
    if not weather_state:
        raise HTTPException(
            status_code=400,
            detail="No weather state for this corridor. Update it via /update/weather first.",
        )

    lead_time_state = state.latest_lead_time_by_corridor.get(corridor_id, {})
    lead_time = int(lead_time_state.get("base_lead_time", 12))
    disruption_event_enc = _resolve_disruption_enc(
        corridor_id=corridor_id,
        disruption_type=payload.disruption_type,
        disruption_event_enc=payload.disruption_event_enc,
    )

    geopolitical_risk = _get_geopolitical_risk_for_corridor(corridor_id)

    effective_order_weight_kg = payload.transport_weight_kg
    if payload.cargo_weight_mt > 0:
        effective_order_weight_kg = int(round(payload.cargo_weight_mt * 1000.0))

    return _infer_from_values(
        corridor_id=corridor_id,
        weather_severity_raw=float(weather_state["weather_severity_raw"]),
        geopolitical_risk=geopolitical_risk,
        inflation_rate=float(state.latest_usd_inflation.get("inflation_rate", 3.0)),
        base_lead_time=lead_time,
        transport_mode_enc=payload.transport_mode_enc,
        disruption_event_enc=disruption_event_enc,
        order_weight_kg=effective_order_weight_kg,
        ship_type=payload.ship_type,
        cargo_weight_mt=payload.cargo_weight_mt,
    )
