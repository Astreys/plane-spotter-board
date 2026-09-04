/**
 * One schedule poller per tracked airport.
 *
 * Same shape as the live poller — the server fetches, the browser reads cache —
 * but on a multi-hour timer instead of a 15-second one, because the upstream is
 * metered by the month. See the budget note in client.ts.
 *
 * A schedule that is a few hours old is still a useful schedule, so failures keep
 * serving the last good fetch and back off rather than blanking the tab.
 */

import type { Airport } from "../config/airports.js";
import { config } from "../config/env.js";
import type { PollerLogger } from "../poller/poller.js";
import type { UpcomingFlight, UpcomingSnapshot } from "../types.js";
import { fetchArrivals } from "./client.js";
import { selectUpcoming } from "./normalize.js";

const MAX_BACKOFF_MS = 60 * 60_000;

interface Cached {
  flights: UpcomingFlight[];
  totalScheduled: number;
  unrecognisedModels: string[];
  fetchedAt: number;
  unitsRemaining: number | null;
}

export class SchedulePoller {
  private cache: Cached | null = null;
  private consecutiveFailures = 0;
  private lastError: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private inFlight = false;

  constructor(
    readonly airport: Airport,
    private readonly log: PollerLogger,
  ) {}

  /** False when there is no key, which is a normal configuration, not a fault. */
  get enabled(): boolean {
    return config.aeroDataBoxKey !== "";
  }

  start(): void {
    if (!this.enabled || this.timer || this.stopped) return;
    void this.tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), delayMs);
    this.timer.unref?.();
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.inFlight) return;
    this.inFlight = true;

    try {
      const result = await fetchArrivals({
        icao: this.airport.icao,
        from: new Date(),
        hours: config.scheduleWindowHours,
      });

      if (result.status === "disabled") {
        this.lastError = "no API key configured";
        return;
      }

      if (result.status === "error") {
        this.consecutiveFailures += 1;
        this.lastError = result.message;
        const backoff = Math.min(
          config.scheduleRefreshMs * 2 ** Math.min(this.consecutiveFailures, 4),
          MAX_BACKOFF_MS,
        );
        this.log.warn("schedule fetch failed", {
          airport: this.airport.icao,
          failures: this.consecutiveFailures,
          retryInMs: backoff,
          error: result.message,
        });
        this.schedule(backoff);
        return;
      }

      const selected = selectUpcoming(result.arrivals);
      this.cache = {
        flights: selected.flights,
        totalScheduled: selected.totalScheduled,
        unrecognisedModels: selected.unrecognisedModels,
        fetchedAt: Date.now(),
        unitsRemaining: result.unitsRemaining,
      };
      this.consecutiveFailures = 0;
      this.lastError = null;

      this.log.info("schedule refreshed", {
        airport: this.airport.icao,
        scheduled: selected.totalScheduled,
        big: selected.flights.length,
        unitsRemaining: result.unitsRemaining,
      });

      this.schedule(config.scheduleRefreshMs);
    } finally {
      this.inFlight = false;
    }
  }

  /**
   * Current view of the cache. Past arrivals are dropped at read time rather than
   * fetch time, so a three-hour-old fetch does not show flights that have landed.
   */
  snapshot(): UpcomingSnapshot {
    const airport = {
      icao: this.airport.icao,
      iata: this.airport.iata,
      name: this.airport.name,
      timeZone: this.airport.timeZone,
    };

    if (!this.cache) {
      return {
        airport,
        updatedAt: 0,
        ageSeconds: 0,
        unavailable: true,
        error: this.enabled ? (this.lastError ?? "no schedule yet") : "no API key configured",
        windowHours: config.scheduleWindowHours,
        totalScheduled: 0,
        flights: [],
        unrecognisedModels: [],
        unitsRemaining: null,
      };
    }

    const now = Date.now();
    return {
      airport,
      updatedAt: this.cache.fetchedAt,
      ageSeconds: Math.round((now - this.cache.fetchedAt) / 1000),
      unavailable: false,
      error: this.lastError,
      windowHours: config.scheduleWindowHours,
      totalScheduled: this.cache.totalScheduled,
      flights: this.cache.flights.filter((f) => new Date(f.arrivalTime).getTime() >= now),
      unrecognisedModels: this.cache.unrecognisedModels,
      unitsRemaining: this.cache.unitsRemaining,
    };
  }
}
