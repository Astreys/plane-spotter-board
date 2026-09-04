import type { CategoryId, GroupId } from "./config/aircraft-types.js";

export type { CategoryId, GroupId };

/** An airport at one end of a flight. Codes can be missing; both never are. */
export interface RouteAirport {
  iata: string | null;
  icao: string | null;
  name: string | null;
  city: string | null;
  countryIso: string | null;
}

/**
 * Where a flight is coming from and going to, by callsign.
 *
 * This is the callsign's *scheduled* route, not observed track history. For an
 * arrival the destination is normally the airport being watched; when it is not,
 * the aircraft is likely operating a different leg under the same callsign, so
 * the UI shows what the schedule says rather than guessing.
 */
export interface FlightRoute {
  origin: RouteAirport | null;
  destination: RouteAirport | null;
  airline: string | null;
  callsignIata: string | null;
  /**
   * True when the scheduled destination is the airport being watched.
   *
   * Often it is not: the route database keys on callsign and returns a typical
   * city pair, which may be a different leg, a different day's schedule, or an
   * aircraft merely passing overhead. When this is false the pair is still shown,
   * but marked, because presenting it as this arrival's route would be a lie.
   */
  arrivesHere: boolean;
}

/** One aircraft on the board. Every optional field really can be missing. */
export interface InboundAircraft {
  /** ICAO 24-bit address, lowercase hex. The only field we can rely on. */
  hex: string;
  callsign: string | null;
  registration: string | null;
  /** ICAO type designator, uppercase, e.g. "B77W". Null when the feed omits it. */
  type: string | null;
  /** Friendly name when we know it, otherwise null — the UI shows `type` then. */
  typeName: string | null;

  altitudeFt: number | null;
  groundSpeedKt: number | null;
  verticalRateFpm: number | null;
  trackDeg: number | null;

  lat: number;
  lon: number;
  /** Distance from the airport, nautical miles. */
  distanceNm: number;
  /** Bearing from the airport to the aircraft — which side of the field to look. */
  bearingFromAirportDeg: number;
  /** 16-point compass label for `bearingFromAirportDeg`. */
  fromDirection: string;
  /** Rough time to touchdown. Null when ground speed is missing or implausible. */
  minutesOut: number | null;

  categories: CategoryId[];
  /** Scheduled origin and destination. Null until the lookup lands, or if there is none. */
  route: FlightRoute | null;
  /** Seconds since the position fix, straight from the feed. */
  seenPosSec: number;
}

export interface SnapshotSource {
  /** Aggregator host that served the current data. */
  host: string;
  attribution: { label: string; url: string; note: string };
}

/** The payload behind both the REST endpoint and every SSE message. */
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
  /** When the upstream data was fetched, epoch ms. */
  updatedAt: number;
  /** Age of that data at serialisation time, seconds. */
  ageSeconds: number;
  /** True when we are serving cache we could not refresh. */
  stale: boolean;
  /** Last upstream failure, if we are currently degraded. */
  error: string | null;
  source: SnapshotSource;
  /** Aircraft the feed returned inside the search radius, before inbound rules. */
  totalTracked: number;
  aircraft: InboundAircraft[];
  /** How many inbound aircraft fall in each category. Drives the chip badges. */
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
  airports: Array<{
    icao: string;
    iata: string;
    name: string;
    city: string;
    tracked: boolean;
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
  attribution: SnapshotSource["attribution"];
  pollIntervalMs: number;
}
