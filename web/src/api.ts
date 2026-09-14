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
  /** ICAO and IATA airline codes, e.g. "ACA" and "AC". The key a logo wants. */
  airlineIcao: string | null;
  airlineIata: string | null;
  /**
   * "callsign" is the flight number's canonical city pair, which is often a
   * different leg; "schedule" is today's arrival from the airport's own schedule.
   */
  source: "callsign" | "schedule";
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
  /**
   * Who operates it, from the airframe record or the route. It names aircraft
   * whose callsign never resolves, which is most general aviation.
   */
  operator: string | null;
  /** ICAO airline code for `operator`, when there is one. */
  operatorIcao: string | null;
  seenPosSec: number;
}

/** One scheduled arrival on the Upcoming board. */
export interface UpcomingFlight {
  number: string | null;
  callsign: string | null;
  airline: string | null;
  status: string | null;
  airlineIcao: string | null;
  airlineIata: string | null;
  isCargo: boolean;
  type: string | null;
  model: string | null;
  typeName: string | null;
  registration: string | null;
  hex: string | null;
  origin: { icao: string | null; iata: string | null; name: string | null } | null;
  arrivalTime: string;
  arrivalIsRevised: boolean;
  terminal: string | null;
  gate: string | null;
  categories: CategoryId[];
}

export interface UpcomingSnapshot {
  airport: { icao: string; iata: string; name: string; timeZone: string };
  updatedAt: number;
  ageSeconds: number;
  stale: boolean;
  /** Nothing fetched yet but a fetch is under way. Show "loading", not "stale". */
  loading: boolean;
  unavailable: boolean;
  error: string | null;
  windowHours: number;
  totalScheduled: number;
  flights: UpcomingFlight[];
  unrecognisedModels: string[];
  unitsRemaining: number | null;
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

/** Chosen on the server from the METAR; the frontend only draws it. */
export type WeatherIcon =
  | "clear"
  | "mostly-clear"
  | "partly-cloudy"
  | "mostly-cloudy"
  | "overcast"
  | "showers"
  | "rain"
  | "snow"
  | "thunder"
  | "fog"
  | "haze";

export interface WeatherObservation {
  /** When the station observed it. Age counts from here, not from any fetch. */
  observedAt: string;
  temperatureC: number | null;
  dewpointC: number | null;
  humidityPct: number | null;
  wind: {
    directionDeg: number | null;
    fromCompass: string | null;
    speedKt: number;
    gustKt: number | null;
    variable: boolean;
    calm: boolean;
  } | null;
  visibilityKm: number | null;
  /** A reported floor: the value means "at least this". */
  visibilityOrMore: boolean;
  cloudBase: { cover: "FEW" | "SCT" | "BKN" | "OVC" | "OVX"; baseFt: number } | null;
  condition: string;
  icon: WeatherIcon;
  isDay: boolean;
  raw: string;
}

export interface WeatherSnapshot {
  airport: { icao: string; iata: string };
  /** Null before the first report, and once the latest is too old to show as current. */
  observation: WeatherObservation | null;
  ageSeconds: number | null;
  stale: boolean;
  loading: boolean;
  unavailable: boolean;
  error: string | null;
}

export interface CategoryDto {
  id: CategoryId;
  group: GroupId;
  label: string;
  blurb: string;
  fallback: boolean;
}

export interface ConfigDto {
  upcomingEnabled: boolean;
  upcomingCategories: CategoryId[];
  /** False hides the weather strip and card, and nothing asks for weather at all. */
  weatherEnabled: boolean;
  /** Every upstream we take data from, for the credits line in the footer. */
  sources: Array<{ label: string; url: string }>;
  airports: Array<{
    icao: string;
    iata: string;
    name: string;
    city: string;
    timeZone: string;
    /** The airport's own site, for the airport card. Null when unknown. */
    website: string | null;
    /** Hero artwork path, or null while the frontend draws its own placeholder. */
    heroImage: string | null;
    tracked: boolean;
    /** Not every tracked airport has an Upcoming board; a schedule costs units. */
    hasSchedule: boolean;
  }>;
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
 * The schedule refreshes on the server every few hours, so the browser asking
 * again on a tab switch costs nothing upstream - it reads the same cache.
 */
export async function fetchUpcoming(
  icao: string,
  signal?: AbortSignal,
): Promise<UpcomingSnapshot> {
  const response = await fetch(apiUrl("/api/airport/" + icao + "/upcoming"), { signal });
  if (!response.ok) throw new Error("upcoming request failed: " + response.status);
  return (await response.json()) as UpcomingSnapshot;
}

/** Reads the server's weather cache. Only the server talks to aviationweather.gov. */
export async function fetchWeather(icao: string, signal?: AbortSignal): Promise<WeatherSnapshot> {
  const response = await fetch(apiUrl(`/api/airport/${icao}/weather`), { signal });
  if (!response.ok) throw new Error(`weather request failed: ${response.status}`);
  return (await response.json()) as WeatherSnapshot;
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
