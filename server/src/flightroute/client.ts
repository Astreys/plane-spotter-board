/**
 * Flight route lookup, from adsbdb.com.
 *
 * The ADS-B feed carries no route: it knows a callsign, not where the flight came
 * from. adsbdb maps a callsign to its scheduled origin and destination. Free, no
 * key, and its own service with its own limit — so it gets its own rate gate and
 * never spends the aggregators' one-request-per-second budget.
 *
 * Named "flightroute" after the field adsbdb returns, to keep it clearly distinct
 * from src/routes/, which is HTTP routing.
 */

import { config } from "../config/env.js";
import type { AircraftRecord, FlightRoute, RouteAirport } from "../types.js";
import { RateGate } from "../util/rate-gate.js";

const ROUTE_URL = "https://api.adsbdb.com/v0/callsign";
const AIRCRAFT_URL = "https://api.adsbdb.com/v0/aircraft";

export const ROUTE_ATTRIBUTION = {
  label: "Routes by adsbdb.com",
  url: "https://www.adsbdb.com",
} as const;

/**
 * adsbdb publishes a limit well above what we need — we only ever ask about the
 * handful of callsigns on the board, and cache hard. Spacing requests anyway
 * keeps us a well-behaved client of a free service.
 */
const gate = new RateGate(config.routeRequestSpacingMs);

interface RawAirport {
  iata_code?: string;
  icao_code?: string;
  name?: string;
  municipality?: string;
  country_iso_name?: string;
}

interface RawResponse {
  response?:
    | string
    | {
        flightroute?: {
          callsign?: string;
          callsign_iata?: string;
          airline?: { name?: string; icao?: string; iata?: string };
          origin?: RawAirport;
          destination?: RawAirport;
        };
      };
}

export type RouteLookup =
  /** adsbdb knows this callsign. */
  | { status: "found"; route: FlightRoute }
  /** adsbdb answered, and has no route for this callsign. Cache it: most GA never will. */
  | { status: "unknown" }
  /** Network or server trouble. Do not cache — try again later. */
  | { status: "error"; message: string };

function toAirport(raw: RawAirport | undefined): RouteAirport | null {
  if (!raw) return null;
  const iata = raw.iata_code?.trim().toUpperCase() ?? null;
  const icao = raw.icao_code?.trim().toUpperCase() ?? null;
  // Without a code there is nothing worth putting on a row.
  if (!iata && !icao) return null;

  return {
    iata,
    icao,
    name: raw.name?.trim() || null,
    city: raw.municipality?.trim() || null,
    countryIso: raw.country_iso_name?.trim().toUpperCase() || null,
  };
}

/** Look one callsign up. Never throws — failure is a value, so a poll cannot die here. */
export async function fetchRoute(callsign: string): Promise<RouteLookup> {
  const trimmed = callsign.trim().toUpperCase();
  // adsbdb 400s on anything that is not a plausible callsign; do not spend a
  // request finding that out.
  if (!/^[A-Z0-9]{3,10}$/.test(trimmed)) return { status: "unknown" };

  try {
    return await gate.run(async () => {
      const response = await fetch(`${ROUTE_URL}/${encodeURIComponent(trimmed)}`, {
        headers: { "User-Agent": config.userAgent, Accept: "application/json" },
        signal: AbortSignal.timeout(config.requestTimeoutMs),
      });

      // 404 is the documented "no such callsign", 400 a malformed one. Both are
      // settled answers rather than failures, so they get cached.
      if (response.status === 404 || response.status === 400) return { status: "unknown" };
      if (!response.ok) return { status: "error", message: `HTTP ${response.status}` };

      const body = (await response.json()) as RawResponse;
      // A miss serialises as {"response":"unknown callsign"} — a string, not an object.
      if (!body.response || typeof body.response === "string") return { status: "unknown" };

      const flightroute = body.response.flightroute;
      if (!flightroute) return { status: "unknown" };

      const origin = toAirport(flightroute.origin);
      const destination = toAirport(flightroute.destination);
      if (!origin && !destination) return { status: "unknown" };

      return {
        status: "found",
        route: {
          origin,
          destination,
          airline: flightroute.airline?.name?.trim() || null,
          airlineIcao: flightroute.airline?.icao?.trim().toUpperCase() || null,
          airlineIata: flightroute.airline?.iata?.trim().toUpperCase() || null,
          callsignIata: flightroute.callsign_iata?.trim().toUpperCase() || null,
          // A canonical pair for the flight number, not necessarily today's leg.
          source: "callsign",
          // Set by the poller, which is the only place that knows the airport.
          arrivesHere: false,
        },
      };
    });
  } catch (error) {
    return { status: "error", message: (error as Error)?.message ?? "unknown error" };
  }
}

/**
 * The same service's other endpoint: an airframe by its Mode S address.
 *
 * It shares the gate above deliberately — one service, one budget — and it is
 * cheap to ask, because an airframe record never changes and caches for a week.
 */
interface RawAircraftResponse {
  response?:
    | string
    | {
        aircraft?: {
          type?: string;
          icao_type?: string;
          manufacturer?: string;
          registration?: string;
          registered_owner?: string;
          registered_owner_operator_flag_code?: string | null;
        };
      };
}

export type AircraftLookup =
  | { status: "found"; aircraft: AircraftRecord }
  /** adsbdb answered and has no record. Cache it: it will not learn this one. */
  | { status: "unknown" }
  /** Network or server trouble. Do not cache — try again later. */
  | { status: "error"; message: string };

/** Look one Mode S address up. Never throws — failure is a value. */
export async function fetchAircraft(hex: string): Promise<AircraftLookup> {
  const trimmed = hex.trim().toLowerCase();
  // A Mode S address is six hex digits. Anything else is not worth a request.
  if (!/^[0-9a-f]{6}$/.test(trimmed)) return { status: "unknown" };

  try {
    return await gate.run<AircraftLookup>(async () => {
      const response = await fetch(`${AIRCRAFT_URL}/${encodeURIComponent(trimmed)}`, {
        headers: { "User-Agent": config.userAgent, Accept: "application/json" },
        signal: AbortSignal.timeout(config.requestTimeoutMs),
      });

      if (response.status === 404 || response.status === 400) return { status: "unknown" };
      if (!response.ok) return { status: "error", message: `HTTP ${response.status}` };

      const body = (await response.json()) as RawAircraftResponse;
      // A miss serialises as {"response":"unknown aircraft"} — a string, not an object.
      if (!body.response || typeof body.response === "string") return { status: "unknown" };

      const raw = body.response.aircraft;
      if (!raw) return { status: "unknown" };

      const aircraft: AircraftRecord = {
        type: raw.icao_type?.trim().toUpperCase() || null,
        model: raw.type?.trim() || null,
        manufacturer: raw.manufacturer?.trim() || null,
        registration: raw.registration?.trim().toUpperCase() || null,
        operator: raw.registered_owner?.trim() || null,
        operatorIcao: raw.registered_owner_operator_flag_code?.trim().toUpperCase() || null,
      };

      // A record with no type and no operator tells a row nothing.
      if (!aircraft.type && !aircraft.operator) return { status: "unknown" };
      return { status: "found", aircraft };
    });
  } catch (error) {
    return { status: "error", message: (error as Error)?.message ?? "unknown error" };
  }
}
