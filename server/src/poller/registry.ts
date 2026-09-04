import { findAirport, type Airport } from "../config/airports.js";
import { config } from "../config/env.js";
import { RouteResolver } from "../flightroute/resolver.js";
import { AirportPoller, type PollerLogger } from "./poller.js";

/**
 * The set of running pollers, keyed by ICAO. Created once at boot from
 * `config.airports`; requests look pollers up here and never create one.
 */
export class PollerRegistry {
  private readonly pollers = new Map<string, AirportPoller>();
  /** One shared cache across airports — a callsign flies one route wherever it lands. */
  private readonly routes: RouteResolver;

  constructor(
    airports: readonly Airport[],
    private readonly log: PollerLogger,
  ) {
    this.routes = new RouteResolver(log);
    for (const airport of airports) {
      this.pollers.set(airport.icao, new AirportPoller(airport, log, this.routes));
    }
  }

  start(): void {
    for (const poller of this.pollers.values()) poller.start();
    this.log.info("pollers started", {
      airports: [...this.pollers.keys()],
      intervalMs: config.pollIntervalMs,
      radiusNm: config.searchRadiusNm,
    });
  }

  stop(): void {
    for (const poller of this.pollers.values()) poller.stop();
    this.routes.stop();
  }

  /** Route cache size and backlog, for the health endpoint. */
  routeStats(): { cached: number; queued: number } {
    return this.routes.stats();
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
