# Frontend Module

This module is the interactive control-tower dashboard built with Next.js and React.

## What The UI Does

- Renders live corridor routes, alternatives, and vessel movement on a geographic map.
- Presents backend inference outputs in an operator-friendly control layout.
- Supports route mode switching, corridor selection, ship-class/cargo tuning, and scenario exploration.
- Surfaces operational context (alerts, weather overlays, headline risk, and derived KPIs).

## Technology Stack

- `Next.js` (App Router) + `React` + `TypeScript`
- `Tailwind CSS` for styling
- `shadcn`/`Radix`-style primitives for composable UI controls
- `react-leaflet` + `leaflet` for geospatial map rendering
- `lucide-react` for iconography

## Frontend Architecture

Layout and composition:

- `app/layout.tsx` and `app/page.tsx` define the dashboard shell and high-level orchestration.

Map subsystem:

- `components/map/ControlTowerMapClient.tsx`: client-side map engine, route rendering, overlays, and animation hooks.
- `components/map/RoutePolyline.tsx`: visual route lines and style logic.
- `components/map/VesselMarker.tsx`: vessel marker rendering and movement behavior.
- `components/map/CycloneZone.tsx`: weather and hazard region overlays.

Panel subsystem:

- `components/panels/CorridorTabs.tsx`: corridor and route-mode controls.
- `components/panels/StatePanel.tsx`: encoded state and action context.
- `components/panels/MetricCard.tsx`, `ActionCard.tsx`, `WeatherWidget.tsx`: KPI and action surfaces.

Shared UI primitives:

- `components/ui/*`: reusable controls and cards (`button`, `tabs`, `sheet`, `popover`, etc.).

Data and contracts:

- `lib/api.ts`: backend request wrappers.
- `types/index.ts`: strict TypeScript contracts aligned with backend payloads.

## Data Flow

1. User changes corridor/mode/ship/cargo controls.
2. Frontend assembles an inference request and calls backend via `lib/api.ts`.
3. Response updates map layers, recommendation cards, and KPI panels.
4. Mode-specific UI sections are shown/hidden based on selected workflow.

## Local Development

```bash
npm install
npm run dev
```

Default local URL:

- `http://localhost:3000`

## Build and Lint

```bash
npm run lint
npm run build
npm run start
```

## Integration Notes

- Ensure backend runs on its configured local URL before using live inference paths.
- Keep payload contract changes synchronized between `backend/main.py` and `types/index.ts`.
- If map behavior appears stale after layout changes, verify client-only rendering and map size invalidation logic in map components.
