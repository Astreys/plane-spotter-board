import type { FastifyInstance } from "fastify";
import { ATTRIBUTION } from "../adsb/client.js";
import { ROUTE_ATTRIBUTION } from "../flightroute/client.js";
import { BIG_CATEGORIES } from "../schedule/normalize.js";
import { AIRPORTS } from "../config/airports.js";
import { CATEGORIES, CATEGORY_GROUPS } from "../config/aircraft-types.js";
import { config } from "../config/env.js";
import { INBOUND_RULES } from "../domain/inbound.js";
import type { PollerRegistry } from "../poller/registry.js";
import type { ConfigDto } from "../types.js";

/**
 * The frontend gets its chips and airport list from here rather than shipping its
 * own copy of the taxonomy — editing src/config/aircraft-types.ts is enough.
 */
export function registerMetaRoutes(app: FastifyInstance, registry: PollerRegistry): void {
  app.get("/api/config", async (): Promise<ConfigDto> => {
    return {
      airports: AIRPORTS.map((airport) => ({
        icao: airport.icao,
        iata: airport.iata,
        name: airport.name,
        city: airport.city,
        tracked: registry.has(airport.icao),
        hasSchedule: registry.hasSchedule(airport.icao),
      })),
      defaultAirport: config.airports[0]!.icao,
      groups: CATEGORY_GROUPS.map((group) => ({ ...group })),
      categories: CATEGORIES.map((category) => ({
        id: category.id,
        group: category.group,
        label: category.label,
        blurb: category.blurb,
        fallback: category.fallback ?? false,
      })),
      rules: {
        maxAltitudeFt: INBOUND_RULES.maxAltitudeFt,
        maxDistanceNm: INBOUND_RULES.maxDistanceNm,
        descentRateFpm: INBOUND_RULES.descentRateFpm,
        lowAltitudeFt: INBOUND_RULES.lowAltitudeFt,
        maxTrackOffsetDeg: INBOUND_RULES.maxTrackOffsetDeg,
        maxPositionAgeSec: INBOUND_RULES.maxPositionAgeSec,
      },
      attribution: ATTRIBUTION,
      upcomingEnabled: registry.scheduleEnabled,
      upcomingCategories: [...BIG_CATEGORIES],
      sources: [
        { label: ATTRIBUTION.label, url: ATTRIBUTION.url },
        { label: ROUTE_ATTRIBUTION.label, url: ROUTE_ATTRIBUTION.url },
        { label: "Photos by planespotters.net", url: "https://www.planespotters.net" },
      ],
      pollIntervalMs: config.pollIntervalMs,
    };
  });

  app.get("/api/health", async (_request, reply) => {
    const pollers = registry.list().map((poller) => {
      const snapshot = poller.snapshot();
      return {
        icao: poller.airport.icao,
        hasData: poller.hasData,
        ageSeconds: snapshot.ageSeconds,
        stale: snapshot.stale,
        error: snapshot.error,
        inbound: snapshot.aircraft.length,
      };
    });

    const ready = pollers.some((p) => p.hasData);
    return reply.code(ready ? 200 : 503).send({
      status: ready ? "ok" : "warming-up",
      uptimeSec: Math.round(process.uptime()),
      scheduleEnabled: registry.scheduleEnabled,
      routes: registry.routeStats(),
      pollers,
    });
  });
}
