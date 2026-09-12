/**
 * Who is inbound.
 *
 * An airline reaches a row two ways: the route lookup names it from the
 * callsign, and the airframe record names its registered operator. The second
 * arrives for aircraft whose callsign never resolves, so it fills most of the
 * gap the card used to report as "not yet identified".
 *
 * Registry names are legal names — "Porter Airlines (Canada) Limited" — so they
 * are tidied for display. The ICAO code travels with the name because that is
 * what an airline logo lookup would be keyed on.
 */

import type { InboundAircraft } from "./api";

export interface AirlineIdentity {
  name: string;
  /** ICAO code where known, e.g. "ACA". Null for a private or unmatched owner. */
  code: string | null;
}

export interface AirlineTally extends AirlineIdentity {
  count: number;
  /** Stands in for a logo while we have no licensed source for airline marks. */
  initials: string;
  /** 0-359, derived from the identity so a carrier keeps its colour between polls. */
  hue: number;
}

export interface AirlineSummary {
  airlines: AirlineTally[];
  /** Aircraft on the board that neither lookup has named yet. */
  unidentified: number;
  /** Distinct airlines found, which can exceed `airlines.length` after the cap. */
  total: number;
}

/** Corporate tails that carry no information on a spotting board. */
const SUFFIXES =
  /[\s,]+(limited|ltd\.?|inc\.?|incorporated|llc|l\.l\.c\.|corp\.?|corporation|company|co\.?|plc|gmbh|ag|a\/s|s\.?a\.?|s\.?a\.?s\.?|n\.?v\.?|b\.?v\.?|pty|pte|oy|ab)$/i;

/**
 * "Porter Airlines (Canada) Limited" -> "Porter Airlines". Parentheses first,
 * then one corporate suffix, then a second pass for "Airways Corp. Ltd".
 */
export function tidyOperator(name: string): string {
  let out = name.replace(/\([^)]*\)/g, " ").replace(/\s{2,}/g, " ").trim();
  for (let i = 0; i < 2; i += 1) {
    const trimmed = out.replace(SUFFIXES, "").trim();
    if (trimmed === out || trimmed === "") break;
    out = trimmed;
  }
  return out || name.trim();
}

/**
 * Two letters, because that is what a tail chip has room for. Multi-word names
 * give one letter per word ("Air Canada" -> "AC"); a single word gives its first
 * two ("Ethiopian" -> "ET").
 */
export function initialsFor(name: string): string {
  const words = name.trim().split(/[\s-]+/).filter(Boolean);
  if (words.length === 0) return "??";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/**
 * FNV-1a over the key. Any stable hash would do; the point is only that a
 * carrier does not change colour when the board re-sorts.
 */
export function hueFor(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 360;
}

/**
 * The airline for one aircraft, or null when neither lookup has landed.
 *
 * The route's airline wins the display name because it is the trading name;
 * the airframe's registered operator is the fallback and is tidied first.
 */
export function identityOf(aircraft: InboundAircraft): AirlineIdentity | null {
  const routeName = aircraft.route?.airline?.trim();
  const operator = aircraft.operator?.trim();
  const name = routeName || (operator ? tidyOperator(operator) : "");
  if (!name) return null;

  const code =
    aircraft.operatorIcao?.trim() ||
    aircraft.route?.airlineIcao?.trim() ||
    aircraft.route?.airlineIata?.trim() ||
    null;

  return { name, code: code ? code.toUpperCase() : null };
}

export function tallyAirlines(aircraft: InboundAircraft[], limit = 6): AirlineSummary {
  const counts = new Map<string, { identity: AirlineIdentity; count: number }>();
  let unidentified = 0;

  for (const item of aircraft) {
    const identity = identityOf(item);
    if (!identity) {
      unidentified += 1;
      continue;
    }

    // Group by code when there is one, so the same carrier under two spellings
    // counts once; otherwise by name.
    const key = identity.code ?? identity.name.toLowerCase();
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { identity, count: 1 });
  }

  const airlines = [...counts.entries()]
    // Busiest first, then alphabetical so equal counts do not shuffle each poll.
    .sort((a, b) => b[1].count - a[1].count || a[1].identity.name.localeCompare(b[1].identity.name))
    .slice(0, limit)
    .map(([key, entry]) => ({
      name: entry.identity.name,
      code: entry.identity.code,
      count: entry.count,
      initials: initialsFor(entry.identity.name),
      hue: hueFor(key),
    }));

  return { airlines, unidentified, total: counts.size };
}
