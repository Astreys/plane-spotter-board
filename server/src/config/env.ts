import path from "node:path";
import { fileURLToPath } from "node:url";
import { AIRPORTS, findAirport, type Airport } from "./airports.js";

/**
 * Load server/.env if it exists, so an API key lives in a gitignored file rather
 * than in a shell profile. Node has done this natively since 20.12, so it costs
 * no dependency. Real environment variables already set always win.
 */
(() => {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    // src/config -> server/, and dist/config -> server/ once compiled.
    process.loadEnvFile(path.resolve(here, "../../.env"));
  } catch {
    // No .env, or an unreadable one. Both are fine — everything has a default.
  }
})();

function num(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function list(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function resolveAirports(): Airport[] {
  const codes = list(process.env.AIRPORTS);
  if (codes.length === 0) return [AIRPORTS[0]!];

  const resolved: Airport[] = [];
  for (const code of codes) {
    const airport = findAirport(code);
    if (!airport) {
      throw new Error(
        `AIRPORTS contains "${code}", which is not in src/config/airports.ts. ` +
          `Known: ${AIRPORTS.map((a) => a.icao).join(", ")}`,
      );
    }
    if (!resolved.some((a) => a.icao === airport.icao)) resolved.push(airport);
  }
  return resolved;
}

/**
 * Schedule airports must also be tracked - there is no live board to attach an
 * Upcoming tab to otherwise. Unknown or untracked codes are dropped rather than
 * throwing, so a stale env var degrades to "no schedule" instead of no boot.
 */
function resolveScheduleAirports(): string[] {
  const tracked = resolveAirports().map((a) => a.icao);
  const requested = list(process.env.SCHEDULE_AIRPORTS);
  if (requested.length === 0) return tracked.slice(0, 1);

  const resolved: string[] = [];
  for (const code of requested) {
    const airport = findAirport(code);
    if (airport && tracked.includes(airport.icao) && !resolved.includes(airport.icao)) {
      resolved.push(airport.icao);
    }
  }
  return resolved;
}

export const config = {
  port: num(process.env.PORT, 8787),
  host: process.env.HOST ?? "0.0.0.0",
  nodeEnv: process.env.NODE_ENV ?? "development",

  airports: resolveAirports(),

  /** Per-airport poll interval. The global rate limiter is the real safety net. */
  pollIntervalMs: num(process.env.POLL_INTERVAL_MS, 15_000),
  searchRadiusNm: Math.min(num(process.env.SEARCH_RADIUS_NM, 60), 250),

  /**
   * Hard floor between any two upstream requests, across every airport. The
   * aggregators publish 1 req/s; we leave headroom rather than ride the line.
   */
  minRequestSpacingMs: num(process.env.MIN_REQUEST_SPACING_MS, 1_200),
  requestTimeoutMs: num(process.env.REQUEST_TIMEOUT_MS, 8_000),

  /**
   * Spacing for route lookups. A separate service from the aggregators with its
   * own limit, so it gets its own budget rather than sharing theirs.
   */
  routeRequestSpacingMs: num(process.env.ROUTE_REQUEST_SPACING_MS, 350),

  userAgent:
    process.env.USER_AGENT ??
    "plane-spotter-board/0.1 (+https://github.com/Astreys/plane-spotter-board)",

  corsOrigins: list(process.env.CORS_ORIGINS),

  /** A snapshot older than this is flagged stale in the payload. */
  staleAfterMs: num(process.env.STALE_AFTER_MS, 90_000),

  /** Serve web/dist from the API process. Handy for single-host deploys. */
  serveStatic: process.env.SERVE_STATIC === "true",

  /**
   * AeroDataBox key for the Upcoming board. Optional by design: without it the
   * live board works exactly as before and the Upcoming tab simply hides, so a
   * fresh clone still runs with no signup.
   */
  aeroDataBoxKey: (process.env.AERODATABOX_API_KEY ?? "").trim(),

  /**
   * How often to refresh the schedule. The free tier is 600 units a month and a
   * FIDS call costs 2, so ~300 calls a month. At 3 hours that is 8 a day, 480 a
   * month — comfortably inside the budget with room for restarts.
   */
  scheduleRefreshMs: num(process.env.SCHEDULE_REFRESH_MS, 3 * 60 * 60_000),

  /** How far ahead the Upcoming board looks. The endpoint caps this at 12. */
  scheduleWindowHours: Math.min(num(process.env.SCHEDULE_WINDOW_HOURS, 12), 12),

  /**
   * Which tracked airports get an Upcoming board.
   *
   * Separate from AIRPORTS because the live board and the schedule scale very
   * differently: the aggregators are free and shared across airports, while a
   * schedule costs metered units per airport. Tracking five airports live is
   * cheap; giving all five a schedule would need five times the monthly budget.
   *
   * Defaults to the first tracked airport, which is the one the board opens on.
   */
  scheduleAirports: resolveScheduleAirports(),

  /**
   * METAR weather for the card, from aviationweather.gov. Free and keyless, so it
   * is on unless switched off - a fresh clone still gets it with no signup.
   */
  weatherEnabled: process.env.WEATHER_ENABLED !== "false",

  /**
   * How often to ask for fresh reports. Stations report hourly, so ten minutes
   * catches each one soon after it is issued. Floored at five minutes: going
   * faster buys nothing, because the reports themselves do not change faster.
   */
  weatherRefreshMs: Math.max(num(process.env.WEATHER_REFRESH_MS, 10 * 60_000), 5 * 60_000),
} as const;

export type Config = typeof config;
