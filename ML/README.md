# ML Module

This module contains the end-to-end modeling workflow for congestion prediction and action policy learning used by the maritime control tower.

## What This Module Produces

- A supervised model (`XGBoost`) that estimates route-level congestion or delay probability.
- A policy table (`Q-table`) that selects the best mitigation action for each operational state.
- Runtime configuration and demo scenario outputs consumed by the backend API.

## Core Technologies

- `Python` for data processing and experimentation.
- `Pandas`/`NumPy` for feature engineering and state generation.
- `scikit-learn` for train/validation/test splitting and evaluation support.
- `XGBoost` for congestion probability classification.
- Contextual bandit style RL update for action-value learning.
- Notebook-driven development in `DPWorldConcise.ipynb`.

## Folder Structure

- `DPWorldConcise.ipynb`: primary R&D notebook with the latest v6/v7 fixes and pipeline.
- `main.py`: API-oriented ML runtime logic and artifact loading.
- `outputs/`: deployable artifact bundle.

Expected artifact files in `outputs/`:

- `xgb_congestion_model.json`
- `q_table.json`
- `pipeline_config.json`
- `demo_outputs.json`

## ML Pipeline (High Level)

1. Load and inspect the global supply-chain disruption dataset.
2. Build corrected operational features (route, weather, disruption, congestion score, etc.).
3. Train XGBoost with strict split discipline.
4. Generate `congestion_probability` only for train/validation rows.
5. Build state space and train policy with contextual bandit updates.
6. Export inference-ready artifacts for backend consumption.

## Notebook Evolution: v1 to Latest

The notebook’s latest flow captures several iterations and fixes. The most important evolution path is below.

### v1 Baseline

- Started from a global disruption dataset with route, weather, risk, and delay labels.
- Built initial delay/congestion framing and early policy heuristics.
- Established the first trainable feature schema and action space.

### v3-v5 Intermediate Stabilization

- Added stronger reward shaping around route actions (`Maintain Course`, `Slow Steam`, `Reroute`).
- Expanded synthetic episode generation to improve state coverage.
- Improved corridor-aware behavior, but some feature and mapping bugs still remained.

### v6 Major Corrective Release

This is where the pipeline became operationally reliable.

- Fixed weather bucketing scale mismatch:
	- old logic treated weather as 0-1 buckets.
	- corrected to true 0-10 source scale before bucketing.
- Fixed route-to-corridor mapping:
	- included missing route classes (notably Commodity).
	- corrected real corridor alignment and expanded DP World corridor set.
- Redesigned state space:
	- `20 corridors x 3 weather levels x 2 congestion levels = 120 states`.
- Added richer corridor priors:
	- geo risk, distance, route-type encodings.
- Tightened reward-band behavior and weather-floor constraints in environment logic.

### v7 Data-Integrity and Learning-Method Fixes (Latest)

- Introduced strict `train/val/test` split discipline:
	- 60/20/20 style split.
	- test data held out from RL signal generation.
- Prevented leakage in congestion probability assignment:
	- only train/validation rows receive model probabilities.
	- test rows remain `NaN` for RL training.
- Updated environment build to drop `NaN` rows before RL episode construction.
- Switched from Bellman-style update to contextual bandit update:
	- old assumption implied invalid future-state value for independent episodes.
	- corrected update uses direct reward averaging per `(state, action)` pair.
- Slowed epsilon decay to improve 120-state exploration coverage.

## Why v7 Matters

The latest workflow is not just a tuning pass. It fixes two critical correctness issues:

- Data leakage between supervised evaluation and policy learning.
- Mismatch between episode structure and Bellman update assumptions.

That makes v7 much more trustworthy for production-style inference and demo outcomes.

## Regenerating Artifacts

Run the notebook end-to-end and export artifacts to `ML/outputs`.
