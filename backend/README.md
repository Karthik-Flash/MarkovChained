# Backend Module

This module hosts the FastAPI inference service that converts live corridor conditions into recommended operational actions.

## Core Responsibilities

- Load ML artifacts (`XGBoost`, `Q-table`, pipeline config, demo scenarios).
- Accept route and signal inputs (weather, disruption, geopolitical risk, lead-time context).
- Run inference to produce:
	- congestion probability
	- best action (`Maintain Course`, `Slow Steam`, `Reroute`)
	- confidence interval and explanation
	- cost, delay, and emissions impact metrics
- Expose update endpoints for incremental state changes without retraining.

## Technology Stack

- `FastAPI` for API routing and request lifecycle.
- `Pydantic` for strict request/response modeling.
- `XGBoost` for supervised congestion scoring.
- `NumPy` for numeric transformations and policy lookup.

Dependencies are listed in `requirements.txt`.

## Key Files

- `main.py`: service implementation, models, startup loading, inference logic, and endpoints.
- `requirements.txt`: Python packages required by the service.
- `scripts/`: helper scripts for seeding and verification.

## Artifact Loading Behavior

On startup, the backend searches for artifacts in this priority set:

1. `backend/outputs`
2. `ML/outputs`

This allows training outputs to remain in ML while backend can still run without manual file moves.

## API Surface

Health and metadata:

- `GET /health`
- `GET /metadata`

Primary inference:

- `POST /infer/route`

Operational updates:

- `POST /update/weather`
- `POST /update/wind`
- `POST /update/disruption`
- `POST /update/geopolitical-risk`
- `POST /update/headlines`
- `POST /update/inflation`
- `POST /update/lead-time`
- `POST /update/corridor-profile`

## Inference Flow (Conceptual)

1. Resolve corridor context from request (`corridor_id`, name, or route fields).
2. Merge live updates and profile defaults from app state.
3. Build model features in the exact order required by the pipeline config.
4. Predict congestion probability with XGBoost.
5. Encode policy state and read best action from Q-table.
6. Compute business-side metrics (delay, fuel, cost, emissions) and response payload.

## Local Run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
fastapi dev main.py
```

Default local URL:

- `http://127.0.0.1:8000`

## Development Notes

- Keep `pipeline_config.json` and `xgb_congestion_model.json` version-aligned.
- If updating state/reward semantics in ML, regenerate and replace `q_table.json` as part of the same release.
- Treat update endpoints as operational overrides; they should not silently redefine training assumptions.
