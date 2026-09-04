import type { FastifyInstance, FastifyReply } from "fastify";
import type { PollerRegistry } from "../poller/registry.js";
import type { InboundSnapshot } from "../types.js";
import { filterSnapshot } from "./inbound.js";

interface Params {
  icao: string;
}

interface Query {
  categories?: string;
  within?: string;
}

/** Proxies and phones both kill idle connections; a comment line keeps them open. */
const HEARTBEAT_MS = 20_000;

/**
 * Server-sent events. One-way, text, reconnects on its own in the browser — which
 * is the whole reason this is not a WebSocket.
 *
 * Each client subscribes to the poller's `snapshot` event. No client causes an
 * upstream request; they all read the same cached snapshot.
 */
export function registerStreamRoutes(app: FastifyInstance, registry: PollerRegistry): void {
  app.get<{ Params: Params; Querystring: Query }>(
    "/api/airport/:icao/stream",
    (request, reply) => {
      const poller = registry.get(request.params.icao);
      if (!poller) {
        void reply.code(404).send({ error: "airport not tracked" });
        return;
      }

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        // Nginx buffers event streams into uselessness without this.
        "X-Accel-Buffering": "no",
      });

      const send = (snapshot: InboundSnapshot): void => {
        if (reply.raw.writableEnded) return;
        const payload = filterSnapshot(snapshot, request.query);
        writeEvent(reply, "snapshot", payload);
      };

      // Send the cache immediately so the board paints before the next poll.
      send(poller.snapshot());

      const onSnapshot = (snapshot: InboundSnapshot): void => send(snapshot);
      poller.on("snapshot", onSnapshot);

      const heartbeat = setInterval(() => {
        if (reply.raw.writableEnded) return;
        reply.raw.write(": keep-alive\n\n");
      }, HEARTBEAT_MS);
      heartbeat.unref?.();

      const cleanup = (): void => {
        clearInterval(heartbeat);
        poller.off("snapshot", onSnapshot);
      };

      request.raw.on("close", cleanup);
      reply.raw.on("close", cleanup);
      reply.raw.on("error", cleanup);
    },
  );
}

function writeEvent(reply: FastifyReply, event: string, data: unknown): void {
  reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
