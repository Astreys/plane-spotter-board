import type { FastifyInstance } from "fastify";
import { applyFilters, parseCategories } from "../domain/filters.js";
import type { PollerRegistry } from "../poller/registry.js";
import type { InboundSnapshot } from "../types.js";

interface Params {
  icao: string;
}

interface Query {
  /** Comma-separated category ids, e.g. `?categories=WIDEBODY,FREIGHTER`. */
  categories?: string;
  /** Hide anything further out than this many minutes. */
  within?: string;
}

/**
 * Reads straight from the poller's cache. This handler must never touch the
 * upstream API — see the note at the top of poller.ts.
 */
export function registerInboundRoutes(app: FastifyInstance, registry: PollerRegistry): void {
  app.get<{ Params: Params; Querystring: Query }>(
    "/api/airport/:icao/inbound",
    async (request, reply) => {
      const poller = registry.get(request.params.icao);
      if (!poller) {
        return reply.code(404).send({
          error: "airport not tracked",
          tracked: registry.list().map((p) => p.airport.icao),
        });
      }

      const snapshot = filterSnapshot(poller.snapshot(), request.query);

      // Clients poll or stream; a cached response here would just serve stale ages.
      reply.header("Cache-Control", "no-store");
      return snapshot;
    },
  );
}

export function filterSnapshot(snapshot: InboundSnapshot, query: Query): InboundSnapshot {
  const categories = parseCategories(query.categories);
  let aircraft = applyFilters(snapshot.aircraft, categories);

  const within = Number(query.within);
  if (Number.isFinite(within) && within > 0) {
    aircraft = aircraft.filter((ac) => ac.minutesOut === null || ac.minutesOut <= within);
  }

  // counts stay unfiltered on purpose: the chips show what is out there, not what
  // survived the current filter.
  return { ...snapshot, aircraft };
}
