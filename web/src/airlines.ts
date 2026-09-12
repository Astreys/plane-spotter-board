/**
 * Counting airlines on the board.
 *
 * The name comes from the route lookup, which is a background job the poll never
 * waits on, so early in a board's life most aircraft have no airline yet. Every
 * count here is therefore "of the ones we could identify" - `unidentified` is
 * returned alongside so the card can say so rather than implying the sky is
 * emptier than it is.
 */

import type { InboundAircraft } from "./api";

export interface AirlineTally {
  name: string;
  count: number;
  /** Stands in for a logo: we have no licensed source for airline marks. */
  initials: string;
  /** 0-359, derived from the name so a carrier keeps its colour between polls. */
  hue: number;
}

export interface AirlineSummary {
  airlines: AirlineTally[];
  /** Aircraft on the board whose airline the route lookup has not named. */
  unidentified: number;
  /** Distinct airlines found, which can exceed `airlines.length` after the cap. */
  total: number;
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
 * FNV-1a over the name. Any stable hash would do; the point is only that a
 * carrier does not change colour when the board re-sorts.
 */
export function hueFor(name: string): number {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i += 1) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 360;
}

export function tallyAirlines(aircraft: InboundAircraft[], limit = 6): AirlineSummary {
  const counts = new Map<string, number>();
  let unidentified = 0;

  for (const item of aircraft) {
    const name = item.route?.airline?.trim();
    if (!name) {
      unidentified += 1;
      continue;
    }
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const airlines = [...counts.entries()]
    // Busiest first, then alphabetical so equal counts do not shuffle each poll.
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count, initials: initialsFor(name), hue: hueFor(name) }));

  return { airlines, unidentified, total: counts.size };
}
