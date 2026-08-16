import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { purgeExpiredRefreshTokens } from "../modules/auth/token.service.js";
import type { TargetType } from "../generated/prisma/client.js";

/**
 * Rolls yesterday's raw events into DailyStat rows so dashboards read one small
 * table instead of scanning event history. Runs after midnight UTC.
 */
export async function aggregateDailyStats(forDate?: Date) {
  const start = forDate ? new Date(forDate) : new Date();
  if (!forDate) start.setUTCDate(start.getUTCDate() - 1);
  start.setUTCHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const where = { createdAt: { gte: start, lt: end } };
  const by: ["targetType", "targetId"] = ["targetType", "targetId"];

  const [views, likes, follows, comments] = await Promise.all([
    prisma.viewEvent.groupBy({ by, where, _count: { _all: true } }),
    prisma.like.groupBy({ by, where, _count: { _all: true } }),
    prisma.follow.groupBy({ by, where, _count: { _all: true } }),
    prisma.comment.groupBy({ by, where, _count: { _all: true } }),
  ]);

  type Row = {
    targetType: TargetType;
    targetId: string;
    views: number;
    likes: number;
    followers: number;
    comments: number;
  };

  const buckets = new Map<string, Row>();
  const bucket = (targetType: TargetType, targetId: string) => {
    const key = `${targetType}:${targetId}`;
    let row = buckets.get(key);
    if (!row) {
      row = { targetType, targetId, views: 0, likes: 0, followers: 0, comments: 0 };
      buckets.set(key, row);
    }
    return row;
  };

  for (const v of views) bucket(v.targetType, v.targetId).views = v._count?._all ?? 0;
  for (const l of likes) bucket(l.targetType, l.targetId).likes = l._count?._all ?? 0;
  for (const f of follows) bucket(f.targetType, f.targetId).followers = f._count?._all ?? 0;
  for (const c of comments) bucket(c.targetType, c.targetId).comments = c._count?._all ?? 0;

  const rows = [...buckets.values()];

  await prisma.$transaction(
    rows.map((row) =>
      prisma.dailyStat.upsert({
        where: {
          targetType_targetId_date: {
            targetType: row.targetType,
            targetId: row.targetId,
            date: start,
          },
        },
        create: { ...row, date: start },
        update: {
          views: row.views,
          likes: row.likes,
          followers: row.followers,
          comments: row.comments,
        },
      })
    )
  );

  const purged = await purgeExpiredRefreshTokens();

  const result = { date: start.toISOString().slice(0, 10), rows: rows.length, purgedTokens: purged };
  logger.info(result, "[daily-stats] complete");
  return result;
}
