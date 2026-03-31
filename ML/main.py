from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
import math
import json
import pickle
from pathlib import Path
from typing import Any, Dict, List, Optional
import warnings

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import xgboost as xgb


APP_TITLE = "MarkovChained Inference API"
APP_VERSION = "1.0.0"


BASE_DIR = Path(__file__).resolve().parent
OUTPUTS_DIR = BASE_DIR / "outputs"
XGB_MODEL_PATH = OUTPUTS_DIR / "xgb_congestion_model.pkl"
XGB_MODEL_JSON_PATH = OUTPUTS_DIR / "xgb_congestion_model.json"
Q_TABLE_PATH = OUTPUTS_DIR / "q_table_v4_final.json"
PIPELINE_CONFIG_PATH = OUTPUTS_DIR / "pipeline_config.json"


class InferenceRequest(BaseModel):
    corridor_id: Optional[int] = Field(
        default=None,
        description="Corridor id in [0,3]. If omitted, provide corridor_name.",
    )
    corridor_name: Optional[str] = Field(
        default=None,
        description="Corridor name such as 'SIN→Colombo'. Used when corridor_id is omitted.",
    )
    weather_severity_raw: float = Field(
        ge=0.0,
        le=1.0,
        description="Weather severity index in [0,1].",
    )
    geopolitical_risk: float = Field(
        ge=0.0,
        le=1.0,
        description="Geopolitical risk index in [0,1].",
    )
    inflation_rate: float = Field(default=3.0, ge=0.0)
    base_lead_time: int = Field(default=12, ge=0)
    transport_mode_enc: int = Field(default=1, ge=0)
    disruption_event_enc: int = Field(default=0, ge=0, le=3)
    order_weight_kg: int = Field(default=5000, ge=0)


class StatePayload(BaseModel):
    index: int
    corridor: str
    weather: str
    congestion: str


class InferenceResponse(BaseModel):
    action: str
    confidence: float
    congestion_probability: float
    congestion_level: str
    delay_saved_hours: float
    cost_saved_usd: float
    carbon_saved_tco2: float
    state: StatePayload
    q_values: Dict[str, float]
    explanation: List[str]


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


class RouteInferenceRequest(BaseModel):
    origin: str
    destination: str
    transport_weight_kg: int = Field(
        default=5000,
        ge=0,
        description="Transport shipment weight in kilograms.",
    )


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


class AppState:
    xgb_model: Any = None
    q_table: Dict[str, Any] = {}
    pipeline_config: Dict[str, Any] = {}
    feature_order: List[str] = []
    corridor_map: Dict[int, str] = {}
    corridor_name_to_id: Dict[str, int] = {}
    weather_thresholds: Dict[str, List[float]] = {}
    congestion_threshold: float = 0.5
    action_meta: Dict[str, Dict[str, Any]] = {}
    latest_weather_by_corridor: Dict[int, Dict[str, Any]] = {}
    latest_usd_inflation: Dict[str, Any] = {}
    latest_lead_time_by_corridor: Dict[int, Dict[str, Any]] = {}
    corridor_profiles: Dict[str, Dict[str, Any]] = {}


state = AppState()


REGION_RISK_LOOKUP = {
    "AE": 0.72,
    "IN": 0.50,
    "LK": 0.35,
    "NL": 0.20,
    "DE": 0.18,
    "CN": 0.45,
    "JP": 0.25,
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


CORRIDOR_COUNTRY_MAP = {
    0: "LK",
    1: "AE",
    2: "IN",
    3: "IN",
}


def _load_pickle(path: Path) -> Any:
    with path.open("rb") as f:
        return pickle.load(f)


def _load_xgb_model() -> Any:
    # Prefer native XGBoost model format to avoid legacy pickle compatibility warnings.
    if XGB_MODEL_JSON_PATH.exists():
        model = xgb.XGBClassifier()
        model.load_model(str(XGB_MODEL_JSON_PATH))
        return model

    if not XGB_MODEL_PATH.exists():
        raise RuntimeError(f"Missing model file: {XGB_MODEL_PATH}")

    # One-time migration path from legacy pickle artifact.
    with warnings.catch_warnings():
        warnings.filterwarnings(
            "ignore",
            message=r".*If you are loading a serialized model.*",
            category=UserWarning,
        )
        model = _load_pickle(XGB_MODEL_PATH)

    if hasattr(model, "save_model"):
        try:
            model.save_model(str(XGB_MODEL_JSON_PATH))
        except Exception:
            # Non-fatal: inference can still proceed with loaded model.
            pass

    return model


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
            raise HTTPException(status_code=400, detail="corridor_id must be one of 0,1,2,3")
        return corridor_id

    if not corridor_name:
        raise HTTPException(status_code=400, detail="Provide corridor_id or corridor_name")

    if corridor_name not in state.corridor_name_to_id:
        allowed = ", ".join(state.corridor_name_to_id.keys())
        raise HTTPException(status_code=400, detail=f"Unknown corridor_name. Allowed: {allowed}")

    return state.corridor_name_to_id[corridor_name]


def _normalize_location_name(value: str) -> str:
    return "".join(value.lower().split())


def _build_route_key(origin: str, destination: str) -> str:
    return f"{origin.upper()}->{destination.upper()}"


def _get_geopolitical_risk_for_corridor(corridor_id: int) -> float:
    country = CORRIDOR_COUNTRY_MAP.get(corridor_id)
    if not country:
        return 0.45
    return float(REGION_RISK_LOOKUP.get(country, 0.45))


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
    clear = state.weather_thresholds.get("Clear", [0.0, 0.33])
    moderate = state.weather_thresholds.get("Moderate", [0.33, 0.66])

    if clear[0] <= weather_raw < clear[1]:
        return 0
    if moderate[0] <= weather_raw < moderate[1]:
        return 1
    return 2


def _build_feature_vector(payload: InferenceRequest, corridor_id: int) -> np.ndarray:
    route_type_enc = corridor_id
    congestion_score = (payload.geopolitical_risk + payload.disruption_event_enc / 3.0) / 2.0

    values = {
        "Geopolitical_Risk_Index": payload.geopolitical_risk,
        "Weather_Severity_Index": payload.weather_severity_raw,
        "Inflation_Rate_Pct": payload.inflation_rate,
        "Base_Lead_Time_Days": payload.base_lead_time,
        "Transportation_Mode_Enc": payload.transport_mode_enc,
        "Route_Type_Enc": route_type_enc,
        "Disruption_Event_Enc": payload.disruption_event_enc,
        "Order_Weight_Kg": payload.order_weight_kg,
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


def _action_key_to_label(action_key: str) -> str:
    mapping = {
        "maintain_course": "Maintain Course",
        "slow_steam": "Slow Steam",
        "reroute": "Reroute",
        "Maintain Course": "Maintain Course",
        "Slow Steam": "Slow Steam",
        "Reroute": "Reroute",
    }
    return mapping.get(action_key, action_key)


def _savings_for_action(action_label: str, congestion_probability: float) -> Dict[str, float]:
    action_lookup = {
        "Maintain Course": state.action_meta.get("0", {}),
        "Slow Steam": state.action_meta.get("1", {}),
        "Reroute": state.action_meta.get("2", {}),
    }
    meta = action_lookup.get(action_label, {})

    scale = congestion_probability + 0.3
    return {
        "delay_saved_hours": round(float(meta.get("delay_saved", 0.0)) * scale, 2),
        "cost_saved_usd": round(float(meta.get("cost_saved", 0.0)) * scale, 2),
        "carbon_saved_tco2": round(float(meta.get("carbon_saved", 0.0)) * scale, 2),
    }


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
) -> InferenceResponse:
    payload = InferenceRequest(
        corridor_id=corridor_id,
        weather_severity_raw=weather_severity_raw,
        geopolitical_risk=geopolitical_risk,
        inflation_rate=inflation_rate,
        base_lead_time=base_lead_time,
        transport_mode_enc=transport_mode_enc,
        disruption_event_enc=disruption_event_enc,
        order_weight_kg=order_weight_kg,
    )

    features = _build_feature_vector(payload, corridor_id)
    congestion_probability = float(state.xgb_model.predict_proba(features)[0, 1])
    congestion_probability = round(congestion_probability, 4)
    explanation = []

    if weather_severity_raw > 0.7:
        explanation.append("Severe weather detected")

    if geopolitical_risk > 0.6:
        explanation.append("High geopolitical risk")

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

    savings = _savings_for_action(action_label, congestion_probability)

    q_values = {
        "Maintain Course": round(value_candidates[0], 4),
        "Slow Steam": round(value_candidates[1], 4),
        "Reroute": round(value_candidates[2], 4),
    }

    corridor_name = state.corridor_map[corridor_id]
    weather_name = ["Clear", "Moderate", "Severe"][weather_level]
    congestion_name = ["Low", "High"][congestion_level]

    if not explanation:
        explanation.append("Conditions are stable, no rerouting required")

    return InferenceResponse(
        action=action_label,
        confidence=confidence,
        congestion_probability=congestion_probability,
        explanation=explanation,
        congestion_level=congestion_name,
        delay_saved_hours=savings["delay_saved_hours"],
        cost_saved_usd=savings["cost_saved_usd"],
        carbon_saved_tco2=savings["carbon_saved_tco2"],
        state=StatePayload(
            index=state_index,
            corridor=corridor_name,
            weather=weather_name,
            congestion=congestion_name,
        ),
        q_values=q_values,
    )


def _load_artifacts() -> None:
    if not XGB_MODEL_JSON_PATH.exists() and not XGB_MODEL_PATH.exists():
        raise RuntimeError(
            f"Missing model file: expected {XGB_MODEL_JSON_PATH.name} or {XGB_MODEL_PATH.name} in {OUTPUTS_DIR}"
        )
    if not Q_TABLE_PATH.exists():
        raise RuntimeError(f"Missing Q-table file: {Q_TABLE_PATH}")
    if not PIPELINE_CONFIG_PATH.exists():
        raise RuntimeError(f"Missing config file: {PIPELINE_CONFIG_PATH}")

    state.xgb_model = _load_xgb_model()
    state.q_table = _load_json(Q_TABLE_PATH)
    state.pipeline_config = _load_json(PIPELINE_CONFIG_PATH)

    state.feature_order = state.pipeline_config.get("feature_order", [])
    if not state.feature_order:
        raise RuntimeError("pipeline_config.json missing feature_order")

    raw_corridor_map = state.pipeline_config.get("corridor_map", {})
    state.corridor_map = {int(k): v for k, v in raw_corridor_map.items()}
    state.corridor_name_to_id = {v: k for k, v in state.corridor_map.items()}

    state.weather_thresholds = state.pipeline_config.get("weather_thresholds", {})
    state.congestion_threshold = float(state.pipeline_config.get("congestion_threshold", 0.5))
    state.action_meta = state.pipeline_config.get("action_meta", {})


@asynccontextmanager
async def lifespan(_: FastAPI):
    _load_artifacts()
    yield


app = FastAPI(title=APP_TITLE, version=APP_VERSION, lifespan=lifespan)


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/metadata")
def metadata() -> Dict[str, Any]:
    return {
        "model_auc": state.pipeline_config.get("model_auc"),
        "feature_order": state.feature_order,
        "corridors": state.corridor_map,
        "weather_thresholds": state.weather_thresholds,
        "congestion_threshold": state.congestion_threshold,
        "latest_weather_by_corridor": state.latest_weather_by_corridor,
        "latest_usd_inflation": state.latest_usd_inflation,
        "corridor_profiles": state.corridor_profiles,
    }


@app.get("/corridors")
def corridors() -> Dict[str, Any]:
    items: List[Dict[str, Any]] = []
    for corridor_id, corridor_name in sorted(state.corridor_map.items()):
        origin = ""
        destination = ""
        if "→" in corridor_name:
            origin, destination = corridor_name.split("→", 1)

        items.append(
            {
                "corridor_id": corridor_id,
                "corridor_name": corridor_name,
                "origin": origin,
                "destination": destination,
            }
        )

    return {
        "corridor_map": state.corridor_map,
        "corridor_name_to_id": state.corridor_name_to_id,
        "corridors": items,
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


@app.post("/infer", response_model=InferenceResponse)
def infer(payload: InferenceRequest) -> InferenceResponse:
    corridor_id = _resolve_corridor_id(payload.corridor_id, payload.corridor_name)

    return _infer_from_values(
        corridor_id=corridor_id,
        weather_severity_raw=payload.weather_severity_raw,
        geopolitical_risk=payload.geopolitical_risk,
        inflation_rate=payload.inflation_rate,
        base_lead_time=payload.base_lead_time,
        transport_mode_enc=payload.transport_mode_enc,
        disruption_event_enc=payload.disruption_event_enc,
        order_weight_kg=payload.order_weight_kg,
    )


@app.post("/infer/route", response_model=InferenceResponse)
def infer_route(payload: RouteInferenceRequest) -> InferenceResponse:
    corridor_id = _resolve_corridor_id_from_route(payload.origin, payload.destination)

    weather_state = state.latest_weather_by_corridor.get(corridor_id)
    if not weather_state:
        raise HTTPException(
            status_code=400,
            detail="No weather state for this corridor. Update it via /update/weather first.",
        )

    lead_time_state = state.latest_lead_time_by_corridor.get(corridor_id, {})
    lead_time = int(lead_time_state.get("base_lead_time", 12))

    geopolitical_risk = _get_geopolitical_risk_for_corridor(corridor_id)

    return _infer_from_values(
        corridor_id=corridor_id,
        weather_severity_raw=float(weather_state["weather_severity_raw"]),
        geopolitical_risk=geopolitical_risk,
        inflation_rate=float(state.latest_usd_inflation.get("inflation_rate", 3.0)),
        base_lead_time=lead_time,
        order_weight_kg=payload.transport_weight_kg,
    )
