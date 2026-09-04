import { AIRPORTS, findAirport, type Airport } from "./airports.js";

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

  userAgent:
    process.env.USER_AGENT ??
    "plane-spotter-board/0.1 (+https://github.com/Astreys/plane-spotter-board)",

  corsOrigins: list(process.env.CORS_ORIGINS),

  /** A snapshot older than this is flagged stale in the payload. */
  staleAfterMs: num(process.env.STALE_AFTER_MS, 90_000),

  /** Serve web/dist from the API process. Handy for single-host deploys. */
  serveStatic: process.env.SERVE_STATIC === "true",
} as const;

export type Config = typeof config;
