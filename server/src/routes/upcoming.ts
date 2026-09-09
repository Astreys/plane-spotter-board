import type { FastifyInstance } from "fastify";
import type { PollerRegistry } from "../poller/registry.js";

interface Params {
  icao: string;
}

/**
 * Reads the schedule cache. Like the inbound route, this must never call the
 * upstream — that budget is monthly, and a per-request call would burn it in an
 * afternoon. See the note at the top of schedule/client.ts.
 */
export function registerUpcomingRoutes(app: FastifyInstance, registry: PollerRegistry): void {
  app.get<{ Params: Params }>("/api/airport/:icao/upcoming", async (request, reply) => {
    const schedule = registry.getSchedule(request.params.icao);
    if (!schedule) {
      return reply.code(404).send({
        error: "no schedule for this airport",
        scheduled: registry.scheduleAirports(),
      });
    }

    // Records interest so the poller knows this airport is worth spending units
    // on. It never fetches here - see the note at the top of schedule/client.ts.
    schedule.markRequested();

    reply.header("Cache-Control", "no-store");
    return schedule.snapshot();
  });
}
