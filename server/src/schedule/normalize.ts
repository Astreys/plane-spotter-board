/**
 * Raw FIDS entries -> the flights the Upcoming board shows.
 *
 * Classification deliberately goes through the same `categoriesFor` the live
 * board uses: the schedule's free-text model is normalised to an ICAO designator
 * first, so the taxonomy stays the single source of truth for what counts as a
 * widebody. Adding a type code still means editing exactly one file.
 */

import { TYPE_NAMES, categoriesFor, type CategoryId } from "../config/aircraft-types.js";
import type { RawScheduledFlight } from "./client.js";
import { toTypeCode } from "./model-codes.js";
import type { UpcomingFlight } from "../types.js";

/** The airframes this board exists for. Anything else is not worth a drive. */
export const BIG_CATEGORIES: readonly CategoryId[] = ["DOUBLE_DECK", "QUAD", "WIDEBODY"];

const text = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/**
 * Prefer the operator's own revision, then a prediction, then the schedule.
 *
 * The vendor sends a revisedTime on almost every flight, usually identical to the
 * scheduled one, so its presence means nothing. Only a revision that actually
 * moves the time is worth marking - otherwise every row reads "revised" and the
 * label stops carrying information.
 */
function bestArrivalTime(flight: RawScheduledFlight): { iso: string | null; revised: boolean } {
  const arrival = flight.arrival;
  const scheduled = toIso(arrival?.scheduledTime?.utc);
  const revised = toIso(arrival?.revisedTime?.utc ?? arrival?.predictedTime?.utc);

  if (revised && revised !== scheduled) return { iso: revised, revised: true };
  return { iso: scheduled ?? revised, revised: false };
}

/**
 * AeroDataBox sends "2026-09-04 16:00Z", which is not what Date.parse expects.
 * Returns null rather than an Invalid Date so a bad value cannot poison a sort.
 */
export function toIso(value: string | undefined): string | null {
  if (!value) return null;
  const normalised = value.trim().replace(" ", "T");
  const parsed = new Date(normalised);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function normalizeFlight(flight: RawScheduledFlight): UpcomingFlight | null {
  const { iso, revised } = bestArrivalTime(flight);
  // Without an arrival time there is no row to place on a timeline.
  if (!iso) return null;

  const model = text(flight.aircraft?.model);
  const type = toTypeCode(model);
  const origin = flight.departure?.airport;

  return {
    number: text(flight.number),
    callsign: text(flight.callSign)?.toUpperCase() ?? null,
    airline: text(flight.airline?.name),
    airlineIcao: text(flight.airline?.icao)?.toUpperCase() ?? null,
    airlineIata: text(flight.airline?.iata)?.toUpperCase() ?? null,
    status: text(flight.status),
    isCargo: flight.isCargo === true,

    type,
    // The vendor's own words are kept so an unmapped model is still legible.
    model,
    typeName: type ? (TYPE_NAMES[type] ?? null) : null,
    registration: text(flight.aircraft?.reg)?.toUpperCase() ?? null,
    hex: text(flight.aircraft?.modeS)?.toLowerCase() ?? null,

    origin: origin
      ? {
          icao: text(origin.icao)?.toUpperCase() ?? null,
          iata: text(origin.iata)?.toUpperCase() ?? null,
          name: text(origin.name),
        }
      : null,

    arrivalTime: iso,
    arrivalIsRevised: revised,
    terminal: text(flight.arrival?.terminal),
    gate: text(flight.arrival?.gate),

    categories: categoriesFor({ type, callsign: flight.callSign ?? null }),
  };
}

export function isBigAircraft(flight: UpcomingFlight): boolean {
  return flight.categories.some((id) => BIG_CATEGORIES.includes(id));
}

export interface NormalizeResult {
  flights: UpcomingFlight[];
  /** Everything the window held, before the airframe filter. */
  totalScheduled: number;
  /** Had a model we could not turn into a designator - worth knowing about. */
  unrecognisedModels: string[];
}

/**
 * Normalise, keep only the big metal, and sort by arrival time.
 *
 * Cancelled and already-landed flights are dropped by the caller passing a `now`;
 * this stays a pure function so it can be tested against a fixture.
 */
export function selectUpcoming(
  raw: RawScheduledFlight[] | undefined,
  options: { now?: Date } = {},
): NormalizeResult {
  const now = options.now ?? new Date();
  const cutoff = now.getTime();
  const flights: UpcomingFlight[] = [];
  const unrecognised = new Set<string>();

  for (const entry of raw ?? []) {
    const flight = normalizeFlight(entry);
    if (!flight) continue;

    if (flight.model && !flight.type) unrecognised.add(flight.model);
    if (!isBigAircraft(flight)) continue;
    // Something that landed twenty minutes ago is not "upcoming".
    if (new Date(flight.arrivalTime).getTime() < cutoff) continue;

    flights.push(flight);
  }

  flights.sort((a, b) => a.arrivalTime.localeCompare(b.arrivalTime));

  return {
    flights,
    totalScheduled: raw?.length ?? 0,
    unrecognisedModels: [...unrecognised].sort(),
  };
}
