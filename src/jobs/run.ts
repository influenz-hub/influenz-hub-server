/**
 * One-shot job runner for cron/CI: `npm run job:recs`, `npm run job:stats`.
 * Exits non-zero on failure so a scheduler can alert.
 */
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { aggregateDailyStats } from "./daily-stats.js";
import { generateRecommendations } from "./recommendations.js";

const jobs = {
  recommendations: generateRecommendations,
  "daily-stats": aggregateDailyStats,
} as const;

const name = process.argv[2] as keyof typeof jobs | undefined;

if (!name || !(name in jobs)) {
  console.error(`Usage: tsx src/jobs/run.ts <${Object.keys(jobs).join("|")}>`);
  process.exit(1);
}

try {
  await jobs[name]();
} catch (err) {
  logger.error({ err }, `[${name}] failed`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
