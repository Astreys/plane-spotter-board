import { findAirport, type Airport } from "../config/airports.js";
import { config } from "../config/env.js";
import { RouteResolver } from "../flightroute/resolver.js";
import { SchedulePoller } from "../schedule/poller.js";
import { AirportPoller, type PollerLogger } from "./poller.js";

/**
 * The set of running pollers, keyed by ICAO. Created once at boot from
 * `config.airports`; requests look pollers up here and never create one.
 */
export class PollerRegistry {
  private readonly pollers = new Map<string, AirportPoller>();
  /** One shared cache across airports — a callsign flies one route wherever it lands. */
  private readonly routes: RouteResolver;
  /** Schedule pollers run alongside, on their own much slower timer. */
  private readonly schedules = new Map<string, SchedulePoller>();

  constructor(
    airports: readonly Airport[],
    private readonly log: PollerLogger,
  ) {
    this.routes = new RouteResolver(log);
    for (const airport of airports) {
      this.pollers.set(airport.icao, new AirportPoller(airport, log, this.routes));
      this.schedules.set(airport.icao, new SchedulePoller(airport, log));
    }
  }

  start(): void {
    for (const poller of this.pollers.values()) poller.start();
    this.log.info("pollers started", {
      airports: [...this.pollers.keys()],
      intervalMs: config.pollIntervalMs,
      radiusNm: config.searchRadiusNm,
    });

    // Starts nothing when no key is configured; the tab just stays hidden.
    for (const schedule of this.schedules.values()) schedule.start();
    if (config.aeroDataBoxKey) {
      this.log.info("schedule pollers started", {
        refreshMs: config.scheduleRefreshMs,
        windowHours: config.scheduleWindowHours,
      });
    } else {
      this.log.info("schedule disabled", { reason: "AERODATABOX_API_KEY not set" });
    }
  }

  stop(): void {
    for (const poller of this.pollers.values()) poller.stop();
    for (const schedule of this.schedules.values()) schedule.stop();
    this.routes.stop();
  }

  /** Route cache size and backlog, for the health endpoint. */
  routeStats(): { cached: number; queued: number } {
    return this.routes.stats();
  }

  /** Accepts ICAO or IATA, like get(). */
  getSchedule(code: string): SchedulePoller | undefined {
    const key = findAirport(code)?.icao ?? code.trim().toUpperCase();
    return this.schedules.get(key);
  }

  get scheduleEnabled(): boolean {
    return config.aeroDataBoxKey !== "";
  }

  /** Accepts ICAO or IATA, any case — spotters type "YYZ", not "CYYZ". */
  get(code: string): AirportPoller | undefined {
    const key = findAirport(code)?.icao ?? code.trim().toUpperCase();
    return this.pollers.get(key);
  }

  list(): AirportPoller[] {
    return [...this.pollers.values()];
  }

  has(code: string): boolean {
    return this.get(code) !== undefined;
  }
}
