import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { startCron } from "./jobs/cron.js";

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info(`Influenz Hub API listening on http://localhost:${env.PORT}`);
});

if (env.ENABLE_CRON) startCron();

/**
 * Stop accepting connections, let in-flight requests finish, then close the
 * database pool — with a hard timeout so a hung request can't block a deploy.
 */
async function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down");

  const force = setTimeout(() => {
    logger.error("Forcing shutdown after timeout");
    process.exit(1);
  }, 10_000);
  force.unref();

  server.close(async () => {
    await prisma.$disconnect();
    clearTimeout(force);
    process.exit(0);
  });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
