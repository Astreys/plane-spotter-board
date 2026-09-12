/**
 * "Is this thing about to land here?"
 *
 * Deliberately simple geometry over a single snapshot: no track history, no
 * runway logic, no flight plans. The output is an estimate and the UI says so.
 * Thresholds live in INBOUND_RULES so they can be tuned in one place after
 * eyeballing a real approach.
 */

import type { Airport } from "../config/airports.js";
import { TYPE_NAMES, categoriesFor } from "../config/aircraft-types.js";
import type { RawAircraft } from "../adsb/types.js";
import type { InboundAircraft } from "../types.js";
import { angleBetween, bearing, compassPoint, distanceNm } from "./geo.js";

export const INBOUND_RULES = {
  /** Above this and it is still cruising or descending from far out. */
  maxAltitudeFt: 13_000,
  maxDistanceNm: 50,
  /** More negative than this counts as descending. */
  descentRateFpm: -200,
  /** Below this we accept it even with a level or unknown vertical rate. */
  lowAltitudeFt: 6_000,
  /** Climbing faster than this is a departure, whatever else it looks like. */
  climbRateFpm: 250,
  /** Max angle between the aircraft's track and the direction to the airport. */
  maxTrackOffsetDeg: 60,
  /** Older position fixes than this are not trustworthy for a live board. */
  maxPositionAgeSec: 60,
  /** Below this ground speed the ETA maths stops meaning anything. */
  minGroundSpeedKt: 60,
} as const;

export interface NormalizedAircraft {
  hex: string;
  callsign: string | null;
  registration: string | null;
  type: string | null;
  altitudeFt: number | null;
  onGround: boolean;
  groundSpeedKt: number | null;
  verticalRateFpm: number | null;
  trackDeg: number | null;
  lat: number;
  lon: number;
  seenPosSec: number;
}

const numberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const trimmedOrNull = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

/**
 * Flatten one raw feed entry. Returns null when the record is unusable — no hex
 * or no position — rather than inventing values.
 */
export function normalize(raw: RawAircraft): NormalizedAircraft | null {
  const hex = trimmedOrNull(raw.hex)?.toLowerCase();
  const lat = numberOrNull(raw.lat);
  const lon = numberOrNull(raw.lon);
  if (!hex || lat === null || lon === null) return null;

  // alt_baro is a number in feet, or the literal string "ground".
  const onGround = raw.alt_baro === "ground";
  const altitudeFt = onGround ? null : numberOrNull(raw.alt_baro);

  return {
    hex,
    callsign: trimmedOrNull(raw.flight),
    registration: trimmedOrNull(raw.r),
    type: trimmedOrNull(raw.t)?.toUpperCase() ?? null,
    altitudeFt,
    onGround,
    groundSpeedKt: numberOrNull(raw.gs),
    verticalRateFpm: numberOrNull(raw.baro_rate) ?? numberOrNull(raw.geom_rate),
    trackDeg: numberOrNull(raw.track),
    lat,
    lon,
    // A missing seen_pos means the feed did not say; assume fresh rather than
    // discarding an aircraft that is probably fine.
    seenPosSec: numberOrNull(raw.seen_pos) ?? 0,
  };
}

export interface InboundVerdict {
  inbound: boolean;
  /** Why it was rejected. Kept for the debug endpoint and for tuning. */
  reason?: string;
  distanceNm: number;
  bearingFromAirportDeg: number;
  trackOffsetDeg: number | null;
}

/** The rules from the spec, in the order that makes rejections readable. */
export function judge(ac: NormalizedAircraft, airport: Airport): InboundVerdict {
  const airportPoint = { lat: airport.lat, lon: airport.lon };
  const acPoint = { lat: ac.lat, lon: ac.lon };

  const distance = distanceNm(airportPoint, acPoint);
  const bearingFromAirport = bearing(airportPoint, acPoint);
  const bearingToAirport = bearing(acPoint, airportPoint);
  const trackOffset = ac.trackDeg === null ? null : angleBetween(ac.trackDeg, bearingToAirport);

  const base = {
    distanceNm: distance,
    bearingFromAirportDeg: bearingFromAirport,
    trackOffsetDeg: trackOffset,
  };
  const no = (reason: string): InboundVerdict => ({ inbound: false, reason, ...base });

  if (ac.onGround) return no("on ground");
  if (ac.altitudeFt === null) return no("no altitude");
  if (ac.seenPosSec > INBOUND_RULES.maxPositionAgeSec) return no("stale position");
  if (distance > INBOUND_RULES.maxDistanceNm) return no("too far");

  // Altitude is compared against the field, not sea level — matters at Calgary.
  const heightAboveField = ac.altitudeFt - airport.elevationFt;
  if (heightAboveField > INBOUND_RULES.maxAltitudeFt) return no("too high");
  if (heightAboveField < -500) return no("below field elevation");

  const rate = ac.verticalRateFpm;
  if (rate !== null && rate > INBOUND_RULES.climbRateFpm) return no("climbing out");

  const descending = rate !== null && rate < INBOUND_RULES.descentRateFpm;
  const low = heightAboveField < INBOUND_RULES.lowAltitudeFt;
  if (!descending && !low) return no("level and high");

  if (trackOffset === null) return no("no track");
  if (trackOffset > INBOUND_RULES.maxTrackOffsetDeg) return no("pointing away");

  return { inbound: true, ...base };
}

/**
 * Minutes to touchdown from distance and ground speed. Rough by design: no wind,
 * no approach path, no slowdown on final. Adds a small pad for the circuit an
 * arrival still has to fly.
 */
export function estimateMinutesOut(distance: number, groundSpeedKt: number | null): number | null {
  if (groundSpeedKt === null || groundSpeedKt < INBOUND_RULES.minGroundSpeedKt) return null;
  const cruiseMinutes = (distance / groundSpeedKt) * 60;
  // Aircraft decelerate on approach, so the straight-line figure runs optimistic.
  const padded = cruiseMinutes * 1.15 + 1;
  return Math.max(0, Math.round(padded));
}

export function toInboundAircraft(
  ac: NormalizedAircraft,
  verdict: InboundVerdict,
): InboundAircraft {
  return {
    hex: ac.hex,
    callsign: ac.callsign,
    registration: ac.registration,
    type: ac.type,
    typeName: ac.type ? (TYPE_NAMES[ac.type] ?? null) : null,
    altitudeFt: ac.altitudeFt,
    groundSpeedKt: ac.groundSpeedKt,
    verticalRateFpm: ac.verticalRateFpm,
    trackDeg: ac.trackDeg,
    lat: ac.lat,
    lon: ac.lon,
    distanceNm: Math.round(verdict.distanceNm * 10) / 10,
    bearingFromAirportDeg: Math.round(verdict.bearingFromAirportDeg),
    fromDirection: compassPoint(verdict.bearingFromAirportDeg),
    minutesOut: estimateMinutesOut(verdict.distanceNm, ac.groundSpeedKt),
    categories: categoriesFor({ type: ac.type, callsign: ac.callsign }),
    // Filled by the poller from the airframe cache, a tick later at the earliest.
    operator: null,
    operatorIcao: null,
    // Filled in by the poller from the route cache; the domain stays pure and
    // synchronous, with no upstream of its own.
    route: null,
    seenPosSec: Math.round(ac.seenPosSec * 10) / 10,
  };
}

/**
 * Full pass over a raw snapshot: normalise, judge, sort by how soon it lands.
 * Nothing here throws on malformed input — bad records are simply dropped.
 */
export function selectInbound(
  rawList: RawAircraft[] | undefined,
  airport: Airport,
): InboundAircraft[] {
  const result: InboundAircraft[] = [];

  for (const raw of rawList ?? []) {
    const ac = normalize(raw);
    if (!ac) continue;
    const verdict = judge(ac, airport);
    if (!verdict.inbound) continue;
    result.push(toInboundAircraft(ac, verdict));
  }

  result.sort((a, b) => {
    // Known ETAs first, soonest at the top; unknown ETAs fall back to distance.
    if (a.minutesOut !== null && b.minutesOut !== null && a.minutesOut !== b.minutesOut) {
      return a.minutesOut - b.minutesOut;
    }
    if (a.minutesOut === null && b.minutesOut !== null) return 1;
    if (a.minutesOut !== null && b.minutesOut === null) return -1;
    return a.distanceNm - b.distanceNm;
  });

  return result;
}
