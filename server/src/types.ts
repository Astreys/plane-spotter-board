import type { CategoryId, GroupId } from "./config/aircraft-types.js";

export type { CategoryId, GroupId };

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
