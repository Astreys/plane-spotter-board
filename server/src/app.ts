import { fileURLToPath } from "node:url";
import path from "node:path";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { config } from "./config/env.js";
import { PollerRegistry } from "./poller/registry.js";
import { registerInboundRoutes } from "./routes/inbound.js";
import { registerMetaRoutes } from "./routes/meta.js";
import { registerPhotoRoutes } from "./routes/photos.js";
import { registerStreamRoutes } from "./routes/stream.js";
import { registerUpcomingRoutes } from "./routes/upcoming.js";

export interface App {
  app: FastifyInstance;
  registry: PollerRegistry;
}

export async function buildApp(): Promise<App> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      transport:
        config.nodeEnv === "development"
          ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } }
          : undefined,
    },
    // SSE responses stay open; the default 0 (no timeout) is what we want, but be
    // explicit so a future default change does not silently cut streams.
    connectionTimeout: 0,
  });

  await app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
  });

  const registry = new PollerRegistry(config.airports, {
    info: (message, data) => app.log.info(data ?? {}, message),
    warn: (message, data) => app.log.warn(data ?? {}, message),
  });

  registerMetaRoutes(app, registry);
  registerInboundRoutes(app, registry);
  registerStreamRoutes(app, registry);
  registerUpcomingRoutes(app, registry);
  registerPhotoRoutes(app);

  if (config.serveStatic) {
    const webDist = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../web/dist",
    );
    await app.register(fastifyStatic, { root: webDist });
    // SPA fallback, but never swallow an unmatched /api route.
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        return reply.code(404).send({ error: "not found" });
      }
      return reply.sendFile("index.html");
    });
  }

  return { app, registry };
}
