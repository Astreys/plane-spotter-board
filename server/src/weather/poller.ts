/**
 * Weather for every tracked airport, from METAR.
 *
 * One poller for all of them rather than one per airport: aviationweather.gov
 * answers any number of stations in a single request, so tracking another
 * airport costs nothing extra upstream. Otherwise the same shape as the other
 * pollers - the server fetches, and every browser reads this cache.
 *
 * Refresh is a heartbeat asking a wall-clock question, exactly as SchedulePoller
 * does and for the same reason: a long timer set before a laptop suspends never
 * fires on time.
 *
 * Staleness is judged by the observation's own time, never by when we fetched it.
 * Stations report hourly, so a fetch a minute ago can hand back a report from
 * fifty minutes ago, and a station that has stopped reporting keeps returning its
 * last one indefinitely. The card has to say how old the weather is - and past a
 * few hours it must not show it as current weather at all.
 */

import type { Airport } from "../config/airports.js";
import { config } from "../config/env.js";
import type { PollerLogger } from "../poller/poller.js";
import type { WeatherSnapshot } from "../types.js";
import { fetchMetars } from "./client.js";
import { toObservation, type ParsedObservation } from "./metar.js";
import { isDaylight } from "./sun.js";

/** How often to ask whether a fetch is due. Not how often we fetch. */
const HEARTBEAT_MS = 60_000;

/** First retry after a failure. Doubles from here, never past the refresh interval. */
const BASE_RETRY_MS = 2 * 60_000;

/** Reports are hourly. Past this one has been missed, and the card says so. */
export const STALE_AFTER_MS = 90 * 60_000;

/**
 * Past this a report is history rather than weather. The card shows nothing
 * instead: three-hour-old sunshine presented as current is worse than no card.
 */
export const EXPIRED_AFTER_MS = 3 * 60 * 60_000;

export interface WeatherStats {
  enabled: boolean;
  /** Stations currently holding a report. */
  stations: number;
  lastFetchAgoSec: number | null;
  error: string | null;
}

export class WeatherPoller {
  private readonly observations = new Map<string, ParsedObservation>();
  private consecutiveFailures = 0;
  private lastError: string | null = null;
  private lastAttemptAt = 0;
  private lastFetchAt = 0;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private inFlight = false;

  constructor(
    private readonly airports: readonly Airport[],
    private readonly log: PollerLogger,
  ) {}

  start(): void {
    if (this.timer || this.stopped) return;
    // Free and keyless, so unlike the schedule there is no reason to wait for demand.
    void this.tick();
    this.timer = setInterval(() => void this.tick(), HEARTBEAT_MS);
    this.timer.unref?.();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private fetchDue(now: number): boolean {
    if (this.consecutiveFailures > 0) {
      const backoff = Math.min(
        BASE_RETRY_MS * 2 ** (this.consecutiveFailures - 1),
        config.weatherRefreshMs,
      );
      return now - this.lastAttemptAt >= backoff;
    }
    return now - this.lastFetchAt >= config.weatherRefreshMs;
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.inFlight) return;
    const now = Date.now();
    if (!this.fetchDue(now)) return;

    this.inFlight = true;
    this.lastAttemptAt = now;

    try {
      const result = await fetchMetars(this.airports.map((airport) => airport.icao));

      if (result.status === "error") {
        this.consecutiveFailures += 1;
        this.lastError = result.message;
        this.log.warn("weather fetch failed", {
          failures: this.consecutiveFailures,
          error: result.message,
        });
        return;
      }

      // Logged on the first success and on recovery only; every ten minutes is noise.
      const worthLogging = this.lastFetchAt === 0 || this.consecutiveFailures > 0;

      for (const report of result.reports) {
        const icao = report.icaoId?.trim().toUpperCase();
        if (!icao || !this.airports.some((airport) => airport.icao === icao)) continue;
        const observation = toObservation(report);
        if (observation) this.observations.set(icao, observation);
      }

      this.consecutiveFailures = 0;
      this.lastError = null;
      this.lastFetchAt = Date.now();

      if (worthLogging) {
        this.log.info("weather refreshed", {
          stations: this.observations.size,
          missing: this.airports
            .map((airport) => airport.icao)
            .filter((icao) => !this.observations.has(icao)),
        });
      }
    } finally {
      this.inFlight = false;
    }
  }

  /** Undefined for an airport this poller does not cover. */
  snapshot(icao: string): WeatherSnapshot | undefined {
    const airport = this.airports.find((entry) => entry.icao === icao);
    if (!airport) return undefined;

    const base = { airport: { icao: airport.icao, iata: airport.iata } };
    const stored = this.observations.get(airport.icao);

    if (!stored) {
      // Before the first answer that is loading; after it, the station sent nothing.
      const loading = this.lastFetchAt === 0 && this.consecutiveFailures === 0;
      return {
        ...base,
        observation: null,
        ageSeconds: null,
        stale: true,
        loading,
        unavailable: true,
        error: this.lastError ?? (loading ? null : "no recent report from this station"),
      };
    }

    const now = Date.now();
    const ageMs = Math.max(0, now - Date.parse(stored.observedAt));
    const expired = ageMs > EXPIRED_AFTER_MS;

    return {
      ...base,
      observation: expired
        ? null
        : { ...stored, isDay: isDaylight(new Date(now), airport.lat, airport.lon) },
      ageSeconds: Math.round(ageMs / 1000),
      stale: ageMs > STALE_AFTER_MS || this.consecutiveFailures > 0,
      loading: false,
      unavailable: expired,
      error: expired ? (this.lastError ?? "latest report is too old to show") : this.lastError,
    };
  }

  stats(): WeatherStats {
    return {
      enabled: true,
      stations: this.observations.size,
      lastFetchAgoSec: this.lastFetchAt ? Math.round((Date.now() - this.lastFetchAt) / 1000) : null,
      error: this.lastError,
    };
  }
}
