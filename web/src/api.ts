/**
 * Shapes the API hands us, plus the two calls that are not the SSE stream.
 *
 * These mirror server/src/types.ts. They are duplicated rather than shared so the
 * frontend stays a plain Vite app with no build-order dependency on the server —
 * the taxonomy itself is not duplicated, it arrives from /api/config.
 */

export type CategoryId = string;
export type GroupId = string;

export interface RouteAirport {
  iata: string | null;
  icao: string | null;
  name: string | null;
  city: string | null;
  countryIso: string | null;
}

/**
 * The callsign's scheduled route.
 *
 * `arrivesHere` is false whenever the scheduled destination is not the airport
 * being watched — which happens often, because the route database keys on
 * callsign and returns a typical city pair rather than today's leg. The row marks
 * those instead of presenting them as this arrival's route.
 */
export interface FlightRoute {
  origin: RouteAirport | null;
  destination: RouteAirport | null;
  airline: string | null;
  callsignIata: string | null;
  arrivesHere: boolean;
}

export interface InboundAircraft {
  hex: string;
  callsign: string | null;
  registration: string | null;
  type: string | null;
  typeName: string | null;
  altitudeFt: number | null;
  groundSpeedKt: number | null;
  verticalRateFpm: number | null;
  trackDeg: number | null;
  lat: number;
  lon: number;
  distanceNm: number;
  bearingFromAirportDeg: number;
  fromDirection: string;
  minutesOut: number | null;
  categories: CategoryId[];
  route: FlightRoute | null;
  seenPosSec: number;
}

export interface Attribution {
  label: string;
  url: string;
  note: string;
}

export interface InboundSnapshot {
  airport: {
    icao: string;
    iata: string;
    name: string;
    city: string;
    lat: number;
    lon: number;
    timeZone: string;
  };
  updatedAt: number;
  ageSeconds: number;
  stale: boolean;
  error: string | null;
  source: { host: string; attribution: Attribution };
  totalTracked: number;
  aircraft: InboundAircraft[];
  counts: Record<string, number>;
}

export interface CategoryDto {
  id: CategoryId;
  group: GroupId;
  label: string;
  blurb: string;
  fallback: boolean;
}

export interface ConfigDto {
  /** Every upstream we take data from, for the credits line in the footer. */
  sources: Array<{ label: string; url: string }>;
  airports: Array<{ icao: string; iata: string; name: string; city: string; tracked: boolean }>;
  defaultAirport: string;
  groups: Array<{ id: GroupId; label: string }>;
  categories: CategoryDto[];
  rules: {
    maxAltitudeFt: number;
    maxDistanceNm: number;
    descentRateFpm: number;
    lowAltitudeFt: number;
    maxTrackOffsetDeg: number;
    maxPositionAgeSec: number;
  };
  attribution: Attribution;
  pollIntervalMs: number;
}

export interface PhotoDto {
  hex: string;
  photo: {
    thumbnail: string;
    large: string;
    photographer: string | null;
    link: string;
  } | null;
}

/** Empty in dev and on single-host deploys; set VITE_API_BASE for a split deploy. */
export const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

export const apiUrl = (path: string): string => `${API_BASE}${path}`;

export async function fetchConfig(signal?: AbortSignal): Promise<ConfigDto> {
  const response = await fetch(apiUrl("/api/config"), { signal });
  if (!response.ok) throw new Error(`config request failed: ${response.status}`);
  return (await response.json()) as ConfigDto;
}

/** Fallback for browsers or proxies where the event stream will not stay open. */
export async function fetchInbound(icao: string, signal?: AbortSignal): Promise<InboundSnapshot> {
  const response = await fetch(apiUrl(`/api/airport/${icao}/inbound`), { signal });
  if (!response.ok) throw new Error(`inbound request failed: ${response.status}`);
  return (await response.json()) as InboundSnapshot;
}

/**
 * Photos are decoration. A failure here resolves to null so a row never breaks
 * over a missing picture.
 */
export async function fetchPhoto(hex: string, signal?: AbortSignal): Promise<PhotoDto["photo"]> {
  try {
    const response = await fetch(apiUrl(`/api/photo/${hex}`), { signal });
    if (!response.ok) return null;
    return ((await response.json()) as PhotoDto).photo;
  } catch {
    return null;
  }
}
