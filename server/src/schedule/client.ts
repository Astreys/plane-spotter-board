/**
 * Today's arrivals, from AeroDataBox's airport FIDS.
 *
 * The fourth upstream, and the only one that needs a key — the ADS-B feed knows
 * what is airborne now and never what is booked for later. It is a separate
 * service with its own budget, so it holds its own rate gate and never spends the
 * aggregators' one-request-per-second allowance.
 *
 * Budget matters here in a way it does not elsewhere. The free tier is 600 units
 * a month and one FIDS call costs 2, so roughly 300 calls a month — about ten a
 * day. That is why the schedule refreshes on a multi-hour timer rather than a
 * 15-second one, and why the result is cached and fanned out like everything
 * else. A per-request call here would exhaust the month in an afternoon.
 */

import { config } from "../config/env.js";
import { RateGate } from "../util/rate-gate.js";

export const SCHEDULE_ATTRIBUTION = {
  label: "Schedule by AeroDataBox",
  url: "https://www.aerodatabox.com",
} as const;

/** The BASIC plan allows one request per second. Ours are hours apart anyway. */
const gate = new RateGate(1_100);

const BASE_URL = "https://aerodatabox.p.rapidapi.com/flights/airports/icao";

/** The endpoint refuses a window longer than 12 hours. */
export const MAX_WINDOW_HOURS = 12;

interface RawTime {
  utc?: string;
  local?: string;
}

interface RawAirportRef {
  icao?: string;
  iata?: string;
  name?: string;
  timeZone?: string;
}

export interface RawScheduledFlight {
  departure?: { airport?: RawAirportRef; scheduledTime?: RawTime; revisedTime?: RawTime };
  arrival?: {
    scheduledTime?: RawTime;
    revisedTime?: RawTime;
    predictedTime?: RawTime;
    terminal?: string;
    gate?: string;
  };
  number?: string;
  callSign?: string;
  status?: string;
  isCargo?: boolean;
  aircraft?: { reg?: string; modeS?: string; model?: string };
  airline?: { name?: string; iata?: string; icao?: string };
}

interface RawResponse {
  arrivals?: RawScheduledFlight[];
}

export type ScheduleFetch =
  | { status: "ok"; arrivals: RawScheduledFlight[]; unitsRemaining: number | null }
  /** No key configured. Not an error: the feature is simply switched off. */
  | { status: "disabled" }
  | { status: "error"; message: string };

/** Local wall-clock, which is the format the endpoint's path segments expect. */
function formatLocal(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * One window of arrivals. Never throws: a schedule is a nice-to-have next to the
 * live board, and it must not be able to take a poll or the process down.
 */
export async function fetchArrivals(params: {
  icao: string;
  from: Date;
  hours: number;
}): Promise<ScheduleFetch> {
  if (!config.aeroDataBoxKey) return { status: "disabled" };

  const hours = Math.min(Math.max(params.hours, 1), MAX_WINDOW_HOURS);
  const to = new Date(params.from.getTime() + hours * 3_600_000);
  const url =
    `${BASE_URL}/${encodeURIComponent(params.icao)}/${formatLocal(params.from)}/${formatLocal(to)}` +
    `?direction=Arrival&withLeg=true&withCancelled=false&withCodeshared=false` +
    `&withCargo=true&withPrivate=false&withLocation=false`;

  try {
    return await gate.run(async () => {
      const response = await fetch(url, {
        headers: {
          "X-RapidAPI-Key": config.aeroDataBoxKey,
          "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(config.requestTimeoutMs),
      });

      if (!response.ok) {
        // 429 means the monthly budget is gone; say so plainly rather than
        // burying it, because the fix is a plan change and not a retry.
        const detail = response.status === 429 ? " (quota exhausted)" : "";
        return { status: "error", message: `HTTP ${response.status}${detail}` };
      }

      const body = (await response.json()) as RawResponse;
      const header = response.headers.get("x-ratelimit-api-units-remaining");
      const unitsRemaining = header === null ? null : Number(header);

      return {
        status: "ok",
        arrivals: Array.isArray(body.arrivals) ? body.arrivals : [],
        unitsRemaining: Number.isFinite(unitsRemaining) ? unitsRemaining : null,
      };
    });
  } catch (error) {
    return { status: "error", message: (error as Error)?.message ?? "unknown error" };
  }
}
