import type { FastifyInstance } from "fastify";
import type { PollerRegistry } from "../poller/registry.js";

interface Params {
  icao: string;
}

/**
 * Reads the weather cache. Never calls aviationweather.gov: the poller does that
 * for every airport at once, and a request here only reads what it last got.
 */
export function registerWeatherRoutes(app: FastifyInstance, registry: PollerRegistry): void {
  app.get<{ Params: Params }>("/api/airport/:icao/weather", async (request, reply) => {
    if (!registry.weatherEnabled) {
      return reply.code(404).send({ error: "weather is switched off (WEATHER_ENABLED=false)" });
    }

    const snapshot = registry.getWeather(request.params.icao);
    if (!snapshot) {
      return reply.code(404).send({
        error: "airport not tracked",
        tracked: registry.list().map((poller) => poller.airport.icao),
      });
    }

    reply.header("Cache-Control", "no-store");
    return snapshot;
  });
}
