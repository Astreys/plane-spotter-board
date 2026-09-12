/**
 * One poller per tracked airport. It owns the only copy of that airport's data.
 *
 *   poller (15s) ──> in-memory snapshot ──> HTTP / SSE ──> browsers
 *
 * Nothing else in the process may call the aggregators, and nothing client-side
 * may either. Adding a fetch on a request path defeats the entire design: the
 * upstream limit is one request per second in total, not per user.
 */

import { EventEmitter } from "node:events";
import { ADSB_HOSTS, ATTRIBUTION, AdsbError, fetchPoint, hostIndex } from "../adsb/client.js";
import type { Airport } from "../config/airports.js";
import { TYPE_NAMES, categoriesFor } from "../config/aircraft-types.js";
import { config } from "../config/env.js";
import { countByCategory } from "../domain/filters.js";
import { selectInbound } from "../domain/inbound.js";
import { arrivesAt } from "../domain/route.js";
import type { AircraftResolver } from "../flightroute/aircraft.js";
import type { RouteResolver } from "../flightroute/resolver.js";
import type { InboundAircraft, InboundSnapshot } from "../types.js";

interface Cached {
  aircraft: InboundAircraft[];
  counts: Record<string, number>;
  totalTracked: number;
  fetchedAt: number;
  host: string;
}

export interface PollerLogger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
}

const MAX_BACKOFF_MS = 5 * 60_000;

export class AirportPoller extends EventEmitter {
  private cache: Cached | null = null;
  private consecutiveFailures = 0;
  private lastError: string | null = null;
  private preferredHost = 0;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private inFlight = false;

  constructor(
    readonly airport: Airport,
    private readonly log: PollerLogger,
    private readonly routes?: RouteResolver,
    private readonly airframes?: AircraftResolver,
  ) {
    super();
    // SSE clients each add a listener; the default cap of 10 is far too low.
    this.setMaxListeners(0);
  }

  start(): void {
    if (this.timer || this.stopped) return;
    void this.tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** True once we have data to serve. Used by the readiness check. */
  get hasData(): boolean {
    return this.cache !== null;
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), delayMs);
    // A pending poll must never hold the process open on its own.
    this.timer.unref?.();
  }

  /**
   * One poll. Never throws and never lets a bad upstream response take the
   * process down — on failure we keep the last good snapshot and back off.
   */
  private async tick(): Promise<void> {
    if (this.stopped || this.inFlight) return;
    this.inFlight = true;

    try {
      const result = await fetchPoint({
        lat: this.airport.lat,
        lon: this.airport.lon,
        radiusNm: config.searchRadiusNm,
        startIndex: this.preferredHost,
      });

      const aircraft = this.enrich(selectInbound(result.snapshot.ac, this.airport));
      this.cache = {
        aircraft,
        counts: countByCategory(aircraft),
        totalTracked: result.snapshot.ac?.length ?? 0,
        fetchedAt: result.fetchedAt,
        host: result.host,
      };

      // Stick with whichever host just worked.
      this.preferredHost = hostIndex(result.host);
      this.consecutiveFailures = 0;
      this.lastError = null;

      this.emit("snapshot", this.snapshot());
      this.schedule(config.pollIntervalMs);
    } catch (error) {
      this.consecutiveFailures += 1;
      this.lastError =
        error instanceof AdsbError ? error.message : ((error as Error)?.message ?? "unknown error");

      // Start the next attempt on a different host.
      this.preferredHost = (this.preferredHost + 1) % ADSB_HOSTS.length;

      const backoff = Math.min(
        config.pollIntervalMs * 2 ** Math.min(this.consecutiveFailures, 6),
        MAX_BACKOFF_MS,
      );
      this.log.warn("poll failed, backing off", {
        airport: this.airport.icao,
        failures: this.consecutiveFailures,
        retryInMs: backoff,
        error: this.lastError,
      });

      this.emit("snapshot", this.snapshot());
      this.schedule(backoff);
    } finally {
      this.inFlight = false;
    }
  }

  /**
   * Attach whatever the two adsbdb caches already hold, and hand the rest over to
   * be looked up in the background. Deliberately not awaited: a slow second
   * upstream must never delay the board, so a newly seen aircraft gains its route
   * and its airframe details on the next tick.
   */
  private enrich(aircraft: InboundAircraft[]): InboundAircraft[] {
    const routes = this.routes;
    const airframes = this.airframes;
    if (!routes && !airframes) return aircraft;

    const enriched = aircraft.map((ac) => {
      const route = routes?.get(ac.callsign) ?? null;
      const record = airframes?.get(ac.hex) ?? null;

      let next: InboundAircraft = {
        ...ac,
        route: route ? { ...route, arrivesHere: arrivesAt(route, this.airport) } : null,
        // The airframe's registered operator is usually the better answer: it is
        // there whether or not the callsign resolved.
        operator: record?.operator ?? route?.airline ?? null,
        operatorIcao: record?.operatorIcao ?? route?.airlineIcao ?? null,
      };

      // The feed leaves the type out often enough to matter, and a row with no
      // type sits in OTHER reading "Unknown type" even when it is a widebody.
      // With a type from adsbdb it classifies through the same taxonomy.
      if (!next.type && record?.type) {
        next = {
          ...next,
          type: record.type,
          typeName: TYPE_NAMES[record.type] ?? record.model ?? null,
          categories: categoriesFor({ type: record.type, callsign: next.callsign }),
        };
      } else if (!next.typeName && record?.model) {
        next = { ...next, typeName: record.model };
      }

      // Only as a fallback: adsbdb returns "CA-GKQL" where the feed says C-GKQL.
      if (!next.registration && record?.registration) {
        next = { ...next, registration: record.registration };
      }

      return next;
    });

    routes?.ensure(aircraft.map((ac) => ac.callsign));
    airframes?.ensure(aircraft.map((ac) => ac.hex));
    return enriched;
  }

  /**
   * Current view of the cache. Serves stale data with `stale: true` and an `age`
   * rather than an error — a board that is 90 seconds old still beats a blank
   * screen in a field.
   */
  snapshot(): InboundSnapshot {
    const airport = {
      icao: this.airport.icao,
      iata: this.airport.iata,
      name: this.airport.name,
      city: this.airport.city,
      lat: this.airport.lat,
      lon: this.airport.lon,
      timeZone: this.airport.timeZone,
    };

    if (!this.cache) {
      return {
        airport,
        updatedAt: 0,
        ageSeconds: 0,
        stale: true,
        error: this.lastError ?? "no data yet",
        source: { host: "none", attribution: ATTRIBUTION },
        totalTracked: 0,
        aircraft: [],
        counts: countByCategory([]),
      };
    }

    const ageMs = Date.now() - this.cache.fetchedAt;
    return {
      airport,
      updatedAt: this.cache.fetchedAt,
      ageSeconds: Math.round(ageMs / 1000),
      stale: ageMs > config.staleAfterMs || this.consecutiveFailures > 0,
      error: this.lastError,
      source: { host: this.cache.host, attribution: ATTRIBUTION },
      totalTracked: this.cache.totalTracked,
      aircraft: this.cache.aircraft,
      counts: this.cache.counts,
    };
  }
}
