/**
 * The board's filter box.
 *
 * Deliberately not a flight search — the spec rules that out. This only narrows
 * the aircraft already on screen, the way the chips do, and never asks the server
 * for anything. It cannot find a flight the board is not already showing.
 *
 * It matches only what a row can vouch for. A route that does not end at this
 * airport has its city name hidden, because that city is probably the flight
 * number's usual leg rather than this one; searching "Montréal" must not surface
 * a row for a reason the row itself refuses to state. Codes are shown, dimmed, so
 * they stay searchable.
 */

import type { InboundAircraft, UpcomingFlight } from "./api";

/**
 * Lowercase, with accents stripped, so "montreal" finds "Montréal" and "sao paulo"
 * finds "São Paulo" — nobody types the diacritics into a filter box.
 */
export function normalise(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** A query split into terms. Empty when there is nothing to filter by. */
export function termsOf(query: string): string[] {
  return normalise(query).split(/\s+/).filter(Boolean);
}

/**
 * Every term must appear somewhere, in any order, so "air canada 777" narrows to
 * Air Canada's triple-sevens rather than widening to both.
 */
export function matchesTerms(haystack: string, terms: readonly string[]): boolean {
  return terms.every((term) => haystack.includes(term));
}

/**
 * A flight number is written "AC 744" on a schedule and typed "AC744" into a box,
 * so both spellings go into the haystack.
 */
function withSpaceless(value: string | null | undefined): string[] {
  if (!value) return [];
  const spaceless = value.replace(/\s+/g, "");
  return spaceless === value ? [value] : [value, spaceless];
}

function haystackOf(parts: Array<string | null | undefined>): string {
  return normalise(parts.filter((part): part is string => Boolean(part)).join(" "));
}

export function inboundHaystack(aircraft: InboundAircraft): string {
  const route = aircraft.route;
  const trusted = route?.arrivesHere === true;

  return haystackOf([
    aircraft.callsign,
    aircraft.registration,
    aircraft.type,
    aircraft.typeName,
    aircraft.operator,
    route?.airline,
    route?.airlineIcao,
    route?.airlineIata,
    ...withSpaceless(route?.callsignIata),
    // Codes are on the row even when the pair is dimmed, so they stay findable.
    route?.origin?.iata,
    route?.origin?.icao,
    route?.destination?.iata,
    route?.destination?.icao,
    // Names only when the route really ends here — the same rule the row follows.
    trusted ? route?.origin?.city : null,
    trusted ? route?.origin?.name : null,
  ]);
}

export function upcomingHaystack(flight: UpcomingFlight): string {
  return haystackOf([
    ...withSpaceless(flight.number),
    flight.callsign,
    flight.airline,
    flight.airlineIcao,
    flight.airlineIata,
    flight.type,
    flight.typeName,
    flight.model,
    flight.registration,
    flight.origin?.iata,
    flight.origin?.icao,
    flight.origin?.name,
    flight.status,
  ]);
}

export function filterInbound(aircraft: InboundAircraft[], query: string): InboundAircraft[] {
  const terms = termsOf(query);
  if (terms.length === 0) return aircraft;
  return aircraft.filter((item) => matchesTerms(inboundHaystack(item), terms));
}

export function filterUpcoming(flights: UpcomingFlight[], query: string): UpcomingFlight[] {
  const terms = termsOf(query);
  if (terms.length === 0) return flights;
  return flights.filter((flight) => matchesTerms(upcomingHaystack(flight), terms));
}
