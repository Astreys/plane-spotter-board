import { findAirport, type Airport } from "../config/airports.js";
import { config } from "../config/env.js";
import { AircraftResolver } from "../flightroute/aircraft.js";
import { RouteResolver } from "../flightroute/resolver.js";
import { SchedulePoller } from "../schedule/poller.js";
import type { WeatherSnapshot } from "../types.js";
import { WeatherPoller, type WeatherStats } from "../weather/poller.js";
import { AirportPoller, type PollerLogger } from "./poller.js";

/**
 * The set of running pollers, keyed by ICAO. Created once at boot from
 * `config.airports`; requests look pollers up here and never create one.
 */
export class PollerRegistry {
  private readonly pollers = new Map<string, AirportPoller>();
  /** One shared cache across airports — a callsign flies one route wherever it lands. */
  private readonly routes: RouteResolver;
  /** Likewise for airframes: an aircraft is the same aircraft at every airport. */
  private readonly airframes: AircraftResolver;
  /** Schedule pollers run alongside, on their own much slower timer. */
  private readonly schedules = new Map<string, SchedulePoller>();
  /**
   * One weather poller for every airport - METAR answers all stations in a single
   * request. Null when WEATHER_ENABLED=false.
   */
  private readonly weather: WeatherPoller | null;

  constructor(
    airports: readonly Airport[],
    private readonly log: PollerLogger,
  ) {
    this.routes = new RouteResolver(log);
    this.airframes = new AircraftResolver(log);
    this.weather = config.weatherEnabled ? new WeatherPoller(airports, log) : null;
    for (const airport of airports) {
      this.pollers.set(
        airport.icao,
        // The lookup is resolved lazily, so it does not matter that this airport's
        // schedule poller is created a few lines below.
        new AirportPoller(airport, log, this.routes, this.airframes, (callsign, hex) =>
          this.schedules.get(airport.icao)?.originFor(callsign, hex) ?? null,
        ),
      );
      // A schedule costs metered units per airport, so only the configured
      // subset gets one. The rest are live-board only.
      if (config.scheduleAirports.includes(airport.icao)) {
        this.schedules.set(airport.icao, new SchedulePoller(airport, log));
      }
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
        airports: [...this.schedules.keys()],
        refreshMs: config.scheduleRefreshMs,
        windowHours: config.scheduleWindowHours,
        note: "fetches on demand, not on boot",
      });
    } else {
      this.log.info("schedule disabled", { reason: "AERODATABOX_API_KEY not set" });
    }

    if (this.weather) {
      this.weather.start();
      this.log.info("weather poller started", {
        airports: [...this.pollers.keys()],
        refreshMs: config.weatherRefreshMs,
      });
    } else {
      this.log.info("weather disabled", { reason: "WEATHER_ENABLED=false" });
    }
  }

  stop(): void {
    for (const poller of this.pollers.values()) poller.stop();
    for (const schedule of this.schedules.values()) schedule.stop();
    this.weather?.stop();
    this.routes.stop();
    this.airframes.stop();
  }

  /** Route cache size and backlog, for the health endpoint. */
  routeStats(): { cached: number; queued: number } {
    return this.routes.stats();
  }

  /** Airframe cache size and backlog, for the health endpoint. */
  aircraftStats(): { cached: number; queued: number } {
    return this.airframes.stats();
  }

  /** Accepts ICAO or IATA, like get(). */
  getSchedule(code: string): SchedulePoller | undefined {
    const key = findAirport(code)?.icao ?? code.trim().toUpperCase();
    return this.schedules.get(key);
  }

  get scheduleEnabled(): boolean {
    return config.aeroDataBoxKey !== "" && this.schedules.size > 0;
  }

  /** ICAO codes that have an Upcoming board. */
  scheduleAirports(): string[] {
    return [...this.schedules.keys()];
  }

  /** Whether this airport has an Upcoming board at all. */
  hasSchedule(code: string): boolean {
    return this.getSchedule(code) !== undefined;
  }

  /** Accepts ICAO or IATA, any case — spotters type "YYZ", not "CYYZ". */
  get(code: string): AirportPoller | undefined {
    const key = findAirport(code)?.icao ?? code.trim().toUpperCase();
    return this.pollers.get(key);
  }

  get weatherEnabled(): boolean {
    return this.weather !== null;
  }

  /** Accepts ICAO or IATA. Undefined for an airport that is not tracked. */
  getWeather(code: string): WeatherSnapshot | undefined {
    const poller = this.get(code);
    if (!poller || !this.weather) return undefined;
    return this.weather.snapshot(poller.airport.icao);
  }

  /** For the health endpoint. */
  weatherStats(): WeatherStats {
    return (
      this.weather?.stats() ?? { enabled: false, stations: 0, lastFetchAgoSec: null, error: null }
    );
  }

  list(): AirportPoller[] {
    return [...this.pollers.values()];
  }

  has(code: string): boolean {
    return this.get(code) !== undefined;
  }
}
