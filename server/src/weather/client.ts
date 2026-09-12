/**
 * Airfield weather, from aviationweather.gov (NOAA / National Weather Service).
 *
 * METAR is the report each airport issues for pilots: measured at the field
 * rather than estimated for a forecast grid square nearby, and it carries the
 * cloud base, which decides whether an approach is visible from miles out or only
 * at the last moment. Free, no key, worldwide.
 *
 * A separate service with its own limit - 100 requests a minute, and it blocks
 * clients that go past it - so it gets its own gate rather than sharing anyone
 * else's. We make one request every ten minutes covering every airport, which is
 * nowhere near that limit; the gate is there so a bug in the poller can never
 * turn into a flood.
 *
 * The browser could not call it directly even if it wanted to: the API does not
 * allow cross-origin requests. It goes through the server cache like every other
 * upstream.
 */

import { config } from "../config/env.js";
import { RateGate } from "../util/rate-gate.js";

export const WEATHER_ATTRIBUTION = {
  label: "Weather from aviationweather.gov",
  url: "https://aviationweather.gov",
} as const;

const BASE_URL = "https://aviationweather.gov/api/data/metar";

const gate = new RateGate(2_000);

/** The fields we read. The feed carries more: altimeter, flight category, remarks. */
export interface RawMetar {
  icaoId?: string;
  /** Observation time, epoch seconds. */
  obsTime?: number;
  temp?: number | null;
  dewp?: number | null;
  /** Degrees true the wind blows from, or "VRB" when it is variable. */
  wdir?: number | string | null;
  wspd?: number | null;
  wgst?: number | null;
  /** Statute miles: a number, or a floor such as "10+". */
  visib?: number | string | null;
  /** Present weather in METAR code, e.g. "-SHRA" or "VCSH". */
  wxString?: string | null;
  clouds?: Array<{ cover?: string; base?: number | null }>;
  rawOb?: string;
}

export type MetarFetch =
  | { status: "ok"; reports: RawMetar[] }
  | { status: "error"; message: string };

/**
 * The latest report for each station, in one request. Never throws: weather is a
 * decoration beside the board and must not be able to take a poll down.
 */
export async function fetchMetars(icaos: readonly string[]): Promise<MetarFetch> {
  if (icaos.length === 0) return { status: "ok", reports: [] };

  const url = `${BASE_URL}?ids=${icaos.map(encodeURIComponent).join(",")}&format=json`;

  try {
    return await gate.run<MetarFetch>(async () => {
      const response = await fetch(url, {
        // The API asks for a real user agent and filters traffic without one.
        headers: { "User-Agent": config.userAgent, Accept: "application/json" },
        signal: AbortSignal.timeout(config.requestTimeoutMs),
      });

      // Documented: a valid request for stations with nothing current to report.
      if (response.status === 204) return { status: "ok", reports: [] };

      if (!response.ok) {
        const detail = response.status === 429 ? " (rate limited)" : "";
        return { status: "error", message: `HTTP ${response.status}${detail}` };
      }

      const body: unknown = await response.json();
      if (!Array.isArray(body)) return { status: "error", message: "unexpected response shape" };
      return { status: "ok", reports: body as RawMetar[] };
    });
  } catch (error) {
    return { status: "error", message: (error as Error)?.message ?? "unknown error" };
  }
}
