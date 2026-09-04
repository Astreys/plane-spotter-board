import { config } from "./config/env.js";
import { buildApp } from "./app.js";

async function main(): Promise<void> {
  const { app, registry } = await buildApp();

  // Start polling before listening so the first request has a chance of hitting
  // warm cache rather than the "no data yet" placeholder.
  registry.start();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "shutting down");
    registry.stop();
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  // A bad upstream response must not take the process down. Log loudly instead.
  process.on("unhandledRejection", (reason) => {
    app.log.error({ reason }, "unhandled rejection");
  });

  await app.listen({ port: config.port, host: config.host });
}

main().catch((error: unknown) => {
  console.error("failed to start:", error);
  process.exit(1);
});
