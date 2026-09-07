/**
 * One schedule poller per tracked airport.
 *
 * Same shape as the live poller - the server fetches, the browser reads cache -
 * but the upstream is metered by the month, so the refresh is measured in hours.
 * See the budget note in client.ts.
 *
 * It deliberately does NOT sleep on one long setTimeout. A three-hour timer set
 * before a laptop suspends does not fire on time, and a schedule that silently
 * froze for a day is exactly the bug this replaced: the board went on showing an
 * empty Upcoming tab while real widebodies were landing. Instead a short
 * heartbeat asks a wall-clock question - is the cache older than the refresh
 * interval? - which survives suspend, resume and clock jumps alike. The heartbeat
 * costs nothing upstream; only the answer does.
 */

import type { Airport } from "../config/airports.js";
import { config } from "../config/env.js";
import type { PollerLogger } from "../poller/poller.js";
import type { UpcomingFlight, UpcomingSnapshot } from "../types.js";
import { fetchArrivals } from "./client.js";
import { selectUpcoming } from "./normalize.js";

/** How often to ask whether a fetch is due. Not how often we fetch. */
const HEARTBEAT_MS = 5 * 60_000;

/** First retry after a failure. Grows from here, never past the refresh interval. */
const BASE_RETRY_MS = 10 * 60_000;

interface Cached {
  flights: UpcomingFlight[];
  totalScheduled: number;
  unrecognisedModels: string[];
  fetchedAt: number;
  /** End of the window this data describes; past it, the cache says nothing. */
  coversUntil: number;
  unitsRemaining: number | null;
}

export class SchedulePoller {
  private cache: Cached | null = null;
  private consecutiveFailures = 0;
  private lastError: string | null = null;
  private lastAttemptAt = 0;
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
    this.timer = setInterval(() => void this.tick(), HEARTBEAT_MS);
    this.timer.unref?.();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Wall-clock decision, so a suspended machine simply refreshes on resume rather
   * than waiting out a timer that never ran.
   */
  private fetchDue(now: number): boolean {
    if (this.consecutiveFailures > 0) {
      const backoff = Math.min(
        BASE_RETRY_MS * 2 ** (this.consecutiveFailures - 1),
        config.scheduleRefreshMs,
      );
      return now - this.lastAttemptAt >= backoff;
    }
    if (!this.cache) return true;
    return now - this.cache.fetchedAt >= config.scheduleRefreshMs;
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.inFlight) return;
    const now = Date.now();
    if (!this.fetchDue(now)) return;

    this.inFlight = true;
    this.lastAttemptAt = now;

    try {
      const from = new Date();
      const result = await fetchArrivals({
        icao: this.airport.icao,
        from,
        hours: config.scheduleWindowHours,
      });

      if (result.status === "disabled") {
        this.lastError = "no API key configured";
        return;
      }

      if (result.status === "error") {
        this.consecutiveFailures += 1;
        this.lastError = result.message;
        this.log.warn("schedule fetch failed", {
          airport: this.airport.icao,
          failures: this.consecutiveFailures,
          error: result.message,
        });
        return;
      }

      const selected = selectUpcoming(result.arrivals);
      this.cache = {
        flights: selected.flights,
        totalScheduled: selected.totalScheduled,
        unrecognisedModels: selected.unrecognisedModels,
        fetchedAt: Date.now(),
        coversUntil: from.getTime() + config.scheduleWindowHours * 3_600_000,
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
    } finally {
      this.inFlight = false;
    }
  }

  /**
   * Current view of the cache. Past arrivals are dropped at read time, so a cache
   * fetched two hours ago still reads correctly.
   *
   * A cache whose window has run out is reported as unavailable rather than as an
   * empty list: "nothing big due" and "we could not refresh" look identical to a
   * spotter otherwise, and only one of them is worth acting on.
   */
  snapshot(): UpcomingSnapshot {
    const airport = {
      icao: this.airport.icao,
      iata: this.airport.iata,
      name: this.airport.name,
      timeZone: this.airport.timeZone,
    };

    const base = {
      airport,
      windowHours: config.scheduleWindowHours,
      unitsRemaining: this.cache?.unitsRemaining ?? null,
    };

    if (!this.cache) {
      return {
        ...base,
        updatedAt: 0,
        ageSeconds: 0,
        stale: true,
        unavailable: true,
        error: this.enabled ? (this.lastError ?? "no schedule yet") : "no API key configured",
        totalScheduled: 0,
        flights: [],
        unrecognisedModels: [],
      };
    }

    const now = Date.now();
    const ageMs = now - this.cache.fetchedAt;
    const expired = now >= this.cache.coversUntil;

    return {
      ...base,
      updatedAt: this.cache.fetchedAt,
      ageSeconds: Math.round(ageMs / 1000),
      stale: ageMs > config.scheduleRefreshMs || this.consecutiveFailures > 0,
      unavailable: expired,
      error: expired ? (this.lastError ?? "schedule is out of date") : this.lastError,
      totalScheduled: this.cache.totalScheduled,
      flights: expired
        ? []
        : this.cache.flights.filter((f) => new Date(f.arrivalTime).getTime() >= now),
      unrecognisedModels: this.cache.unrecognisedModels,
    };
  }
}
