import cron from "node-cron";
import { logger } from "../lib/logger.js";
import { aggregateDailyStats } from "./daily-stats.js";
import { generateRecommendations } from "./recommendations.js";

/**
 * In-process scheduling, enabled with ENABLE_CRON=true. Fine for a single VPS;
 * if the API is ever scaled horizontally, run these as separate one-shot
 * processes (`npm run job:*`) so they don't execute once per instance.
 */
export function startCron() {
  cron.schedule("15 0 * * *", () => {
    void aggregateDailyStats().catch((err) => logger.error({ err }, "[cron] daily-stats failed"));
  });

  cron.schedule("0 3 * * *", () => {
    void generateRecommendations().catch((err) =>
      logger.error({ err }, "[cron] recommendations failed")
    );
  });

  logger.info("Cron enabled: daily-stats 00:15 UTC, recommendations 03:00 UTC");
}
