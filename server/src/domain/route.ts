/**
 * Does a looked-up route actually end at the airport we are watching?
 *
 * Often it does not. The route database keys on callsign and stores one canonical
 * city pair, but airlines reuse a flight number across different pairs on
 * different days and seasons. Measured against YYZ short-final traffic, the
 * stored pair frequently describes a different leg entirely — so this answer is
 * what lets the UI show the route without asserting it is this arrival's.
 */

import type { Airport } from "../config/airports.js";
import type { ScheduledOrigin } from "../schedule/normalize.js";
import type { FlightRoute, RouteAirport } from "../types.js";

export function isSameAirport(airport: RouteAirport | null, target: Airport): boolean {
  if (!airport) return false;
  // The database is not consistent about which code it fills, so accept either.
  return airport.icao === target.icao || airport.iata === target.iata;
}

/** True when the scheduled destination is the airport being watched. */
export function arrivesAt(route: FlightRoute | null, target: Airport): boolean {
  return isSameAirport(route?.destination ?? null, target);
}

/**
 * True when the scheduled *origin* is the airport being watched — the stored pair
 * is the outbound leg of this flight number. Worth distinguishing from an
 * unrelated pair: it means the number is right and the direction is not.
 */
export function departsFrom(route: FlightRoute | null, target: Airport): boolean {
  return isSameAirport(route?.origin ?? null, target);
}

/**
 * Replace a callsign's canonical city pair with today's actual leg.
 *
 * This is the fix for the failure the database cannot avoid: adsbdb returns
 * Montréal → New York for ACA744, a flight number that on the day in question
 * flew San Francisco → Toronto. The airport's own schedule knows the real origin,
 * and we have already fetched it, so where the two disagree the schedule wins.
 *
 * The destination is the airport being watched by definition — this arrival is
 * the schedule entry — so the result is marked as arriving here.
 */
export function withScheduledOrigin(
  route: FlightRoute | null,
  origin: ScheduledOrigin,
  target: Airport,
): FlightRoute {
  const destination: RouteAirport = {
    iata: target.iata,
    icao: target.icao,
    name: target.name,
    city: target.city,
    countryIso: null,
  };

  return {
    origin: {
      iata: origin.iata,
      icao: origin.icao,
      name: origin.name,
      // The schedule names the airport, not its town; the row prefers the name.
      city: null,
      countryIso: null,
    },
    destination,
    // Whatever the callsign lookup knew about the operator is still true.
    airline: route?.airline ?? null,
    callsignIata: route?.callsignIata ?? null,
    airlineIcao: route?.airlineIcao ?? null,
    airlineIata: route?.airlineIata ?? null,
    source: "schedule",
    arrivesHere: true,
  };
}
