import type { BackendCorridor, CorridorDefinition, LatLngTuple } from "@/types";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export const TRANSPORT_MODE_TO_ENC = {
  SEA: 1,
  AIR: 2,
} as const;

export const DEFAULT_WEATHER_RAW: Record<number, number> = {
  0: 0.45,
  1: 0.76,
  2: 0.52,
  3: 0.58,
  4: 0.33,
  5: 0.48,
  6: 0.82,
  7: 0.62,
  8: 0.60,
  9: 0.66,
  10: 0.40,
  11: 0.68,
  12: 0.64,
  13: 0.50,
  14: 0.63,
  15: 0.42,
  16: 0.70,
  17: 0.38,
  18: 0.65,
  19: 0.57,
};

export const DEFAULT_GEO_RISK: Record<number, number> = {
  0: 0.3,
  1: 0.68,
  2: 0.42,
  3: 0.4,
  4: 0.28,
  5: 0.35,
  6: 0.72,
  7: 0.55,
  8: 0.5,
  9: 0.55,
  10: 0.25,
  11: 0.65,
  12: 0.58,
  13: 0.4,
  14: 0.52,
  15: 0.32,
  16: 0.7,
  17: 0.3,
  18: 0.62,
  19: 0.58,
};

const PORT_COORDS: Record<string, LatLngTuple> = {
  HAM: [53.5461, 9.9661],
  NYC: [40.7128, -74.006],
  MUM: [19.076, 72.8777],
  FXT: [51.963, 1.351],
  SAN: [-23.9608, -46.3336],
  SHA: [31.2304, 121.4737],
  LAX: [33.7405, -118.2719],
  TOK: [35.6762, 139.6503],
  SIN: [1.264, 103.84],
  CMB: [6.9271, 79.8612],
  JEA: [24.9857, 55.0421],
  MUN: [22.7396, 69.7],
  NSA: [18.95, 72.95],
  RTM: [51.9244, 4.4777],
  PUS: [35.1796, 129.0756],
  DKR: [14.7167, -17.4677],
  SYD: [-33.8688, 151.2093],
  SHZ: [22.5431, 114.0579],
};

const NAME_TO_CODE: Record<string, string> = {
  COLOMBO: "CMB",
  JEBELALI: "JEA",
  MUNDRA: "MUN",
  NHAVASHEVA: "NSA",
  ROTTERDAM: "RTM",
  BUSAN: "PUS",
  SHANGHAI: "SHA",
  SINGAPORE: "SIN",
  HAMBURG: "HAM",
  FELIXSTOWE: "FXT",
  SANTOS: "SAN",
  DAKAR: "DKR",
  SYDNEY: "SYD",
  SHENZHEN: "SHZ",
};

const CODE_TO_NAME: Record<string, string> = {
  HAM: "Hamburg",
  NYC: "New York",
  MUM: "Mumbai",
  FXT: "Felixstowe",
  SAN: "Santos",
  SHA: "Shanghai",
  LAX: "Los Angeles",
  TOK: "Tokyo",
  SIN: "Singapore",
  CMB: "Colombo",
  JEA: "Jebel Ali",
  MUN: "Mundra",
  NSA: "Nhava Sheva",
  RTM: "Rotterdam",
  PUS: "Busan",
  DKR: "Dakar",
  SYD: "Sydney",
  SHZ: "Shenzhen",
};

function normalizePort(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z]/g, "");
}

function toDisplayPortName(port: string): string {
  const normalized = normalizePort(port);

  if (CODE_TO_NAME[normalized]) {
    return CODE_TO_NAME[normalized];
  }

  if (NAME_TO_CODE[normalized]) {
    const code = NAME_TO_CODE[normalized];
    return CODE_TO_NAME[code] ?? port;
  }

  return port;
}

function resolvePortCoord(port: string): LatLngTuple {
  const direct = PORT_COORDS[normalizePort(port)];
  if (direct) {
    return direct;
  }

  const alias = NAME_TO_CODE[normalizePort(port)];
  if (alias && PORT_COORDS[alias]) {
    return PORT_COORDS[alias];
  }

  return [16.5, 87.2];
}

function buildArcPath(origin: LatLngTuple, destination: LatLngTuple): LatLngTuple[] {
  const [lat1, lon1] = origin;
  const [lat2, lon2] = destination;
  const lonDiff = Math.abs(lon2 - lon1);
  const arc = Math.max(2, Math.min(10, lonDiff / 15));

  return [
    origin,
    [lat1 * 0.7 + lat2 * 0.3 + arc, lon1 * 0.7 + lon2 * 0.3],
    [lat1 * 0.35 + lat2 * 0.65 + arc, lon1 * 0.35 + lon2 * 0.65],
    destination,
  ];
}

function unwrapPathLongitudes(path: LatLngTuple[]): LatLngTuple[] {
  if (path.length < 2) {
    return path;
  }

  const unwrapped: LatLngTuple[] = [[path[0][0], path[0][1]]];

  for (let i = 1; i < path.length; i += 1) {
    const [lat, lon] = path[i] as LatLngTuple;
    const prevLon = unwrapped[i - 1][1];
    let candidate = lon;

    // Shift by 360 degrees to keep adjacent segments visually continuous.
    while (candidate - prevLon > 180) {
      candidate -= 360;
    }
    while (candidate - prevLon < -180) {
      candidate += 360;
    }

    unwrapped.push([lat, candidate]);
  }

  return unwrapped;
}

const SEA_ROUTE_WAYPOINTS: Record<string, LatLngTuple[]> = {
  "HAM→NYC": [
    [53.2, 4.8],
    [50.2, -4.8],
    [48.6, -13.0],
    [46.7, -22.0],
    [44.8, -31.0],
    [42.9, -40.0],
    [41.8, -50.0],
    [40.9, -60.0],
    [40.7, -67.0],
  ],
  "MUM→FXT": [
    [16.5, 71.0],
    [13.0, 64.0],
    [12.2, 58.0],
    [12.4, 51.0],
    [12.6, 44.8],
    [18.0, 40.0],
    [24.0, 37.0],
    [29.0, 34.0],
    [31.2, 32.2],
    [33.2, 29.0],
    [35.6, 22.0],
    [38.6, 15.5],
    [42.2, 9.0],
    [46.0, 4.2],
    [50.2, 1.8],
  ],
  "SAN→SHA": [
    [-28.0, -30.0],
    [-32.0, -10.0],
    [-34.8, 15.0],
    [-29.0, 30.0],
    [-23.0, 45.0],
    [-16.0, 60.0],
    [-8.0, 76.0],
    [-2.0, 90.0],
    [3.0, 99.0],
    [8.0, 104.0],
    [14.0, 110.0],
    [20.0, 116.0],
    [25.0, 120.0],
  ],
  "SHA→LAX": [
    [32.0, 126.0],
    [35.0, 140.0],
    [38.0, 155.0],
    [39.0, 170.0],
    [38.0, -178.0],
    [36.0, -165.0],
    [34.0, -152.0],
    [33.0, -140.0],
    [33.0, -128.0],
  ],
  "TOK→SIN": [
    [33.0, 136.0],
    [29.0, 132.0],
    [24.0, 126.0],
    [20.0, 121.0],
    [15.0, 116.0],
    [9.0, 110.0],
    [5.0, 105.0],
  ],
  "SIN→CMB": [
    [4.0, 100.0],
    [5.2, 97.0],
    [6.0, 93.0],
    [6.8, 88.0],
    [7.0, 84.0],
  ],
  "SIN→JEA": [
    [4.0, 97.0],
    [6.0, 92.0],
    [8.0, 87.0],
    [10.2, 81.0],
    [13.0, 74.0],
    [16.0, 68.0],
    [20.0, 62.0],
    [23.0, 57.0],
  ],
  "SIN→MUN": [
    [5.0, 96.0],
    [6.8, 91.0],
    [9.0, 86.0],
    [11.2, 82.0],
    [14.0, 77.0],
    [16.0, 74.5],
    [19.0, 72.0],
  ],
  "SIN→NSA": [
    [5.0, 96.0],
    [6.8, 91.0],
    [9.0, 86.0],
    [11.0, 82.0],
    [13.0, 78.0],
    [15.0, 76.0],
    [17.0, 74.0],
  ],
  "SIN→RTM": [
    [5.0, 97.0],
    [7.0, 92.0],
    [10.0, 86.0],
    [12.0, 80.0],
    [15.0, 73.0],
    [18.0, 66.0],
    [22.0, 60.0],
    [26.0, 53.0],
    [30.0, 47.0],
    [31.5, 32.5],
    [33.0, 29.0],
    [36.0, 20.0],
    [39.0, 14.0],
    [43.0, 9.0],
    [46.5, 5.5],
    [50.0, 3.0],
  ],
  "SIN→PUS": [
    [6.0, 106.0],
    [10.0, 110.0],
    [14.0, 113.0],
    [19.0, 117.0],
    [24.0, 121.0],
    [28.0, 124.0],
    [31.0, 126.0],
  ],
  "JEA→RTM": [
    [20.0, 49.0],
    [13.0, 44.0],
    [20.0, 39.0],
    [29.0, 34.0],
    [31.5, 32.5],
    [33.0, 29.0],
    [36.0, 20.0],
    [39.0, 14.0],
    [44.0, 9.0],
    [47.0, 6.0],
    [50.0, 4.0],
  ],
  "SHA→RTM": [
    [24.0, 121.0],
    [12.0, 106.0],
    [6.0, 98.0],
    [9.0, 84.0],
    [15.0, 72.0],
    [23.0, 58.0],
    [30.0, 45.0],
    [31.5, 32.5],
    [33.0, 29.0],
    [36.0, 20.0],
    [39.0, 14.0],
    [44.0, 9.0],
    [47.0, 6.0],
    [50.0, 4.0],
  ],
  "MUM→CMB": [
    [14.0, 74.0],
    [12.0, 75.5],
    [10.0, 77.0],
    [8.2, 78.6],
  ],
  "SIN→DKR": [
    [0.0, 96.0],
    [-10.0, 72.0],
    [-22.0, 50.0],
    [-34.0, 18.0],
    [-18.0, -2.0],
    [0.0, -12.0],
    [10.0, -16.0],
  ],
  "SIN→SYD": [
    [-5.0, 111.0],
    [-13.0, 122.0],
    [-20.0, 136.0],
    [-24.0, 143.0],
    [-29.0, 152.0],
  ],
  "JEA→NYC": [
    [20.0, 49.0],
    [13.0, 44.0],
    [20.0, 39.0],
    [29.0, 34.0],
    [31.5, 32.5],
    [33.0, 29.0],
    [36.0, 20.0],
    [40.0, 12.0],
    [44.0, 9.0],
    [45.0, -6.0],
    [41.0, -30.0],
    [40.0, -55.0],
    [40.0, -68.0],
  ],
  "SHA→PUS": [
    [33.0, 124.0],
    [34.5, 127.0],
  ],
  "SHZ→RTM": [
    [20.0, 115.0],
    [12.0, 106.0],
    [6.0, 98.0],
    [9.0, 84.0],
    [15.0, 72.0],
    [23.0, 58.0],
    [30.0, 45.0],
    [31.5, 32.5],
    [33.0, 29.0],
    [36.0, 20.0],
    [39.0, 14.0],
    [44.0, 9.0],
    [47.0, 6.0],
    [50.0, 4.0],
  ],
  "MUM→JEA": [
    [17.0, 68.0],
    [19.0, 65.0],
    [21.0, 62.0],
    [22.5, 59.5],
    [24.0, 57.0],
  ],
};

function buildSeaRoutePath(corridorName: string, origin: LatLngTuple, destination: LatLngTuple): LatLngTuple[] {
  const route = SEA_ROUTE_WAYPOINTS[corridorName];
  if (route && route.length > 0) {
    return unwrapPathLongitudes([origin, ...route, destination]);
  }
  return unwrapPathLongitudes(buildArcPath(origin, destination));
}

export function corridorFromBackend(item: BackendCorridor): CorridorDefinition {
  const originCoord = resolvePortCoord(item.origin);
  const destinationCoord = resolvePortCoord(item.destination);
  const path = buildSeaRoutePath(item.corridor_name, originCoord, destinationCoord);
  const vessel = path[Math.floor(path.length / 2)] as LatLngTuple;
  const cyclone: LatLngTuple = [vessel[0] + 2.2, vessel[1] - 3.2];

  return {
    id: item.corridor_id,
    name: item.corridor_name,
    origin: toDisplayPortName(item.origin),
    destination: toDisplayPortName(item.destination),
    path,
    vessel,
    cyclone,
    risk: DEFAULT_GEO_RISK[item.corridor_id] ?? 0.45,
  };
}

export const FALLBACK_CORRIDORS: CorridorDefinition[] = [
  {
    id: 6,
    name: "SIN→JEA",
    origin: "Singapore",
    destination: "Jebel Ali",
    path: [
      [1.264, 103.84],
      [9.4, 86.8],
      [15.7, 71.2],
      [24.9857, 55.0421],
    ],
    vessel: [15.7, 71.2],
    cyclone: [18.2, 67.8],
    risk: 0.72,
  },
];
