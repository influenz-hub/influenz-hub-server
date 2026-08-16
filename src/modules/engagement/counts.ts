import { prisma } from "../../lib/prisma.js";
import type { TargetType } from "../../generated/prisma/client.js";

/**
 * Batch counter lookups. List endpoints must never issue a count query per row —
 * these group once over the whole page and return maps for O(1) lookup.
 */
export async function countsFor(targetType: TargetType, targetIds: string[]) {
  if (targetIds.length === 0) {
    return { followers: new Map<string, number>(), likes: new Map<string, number>() };
  }

  const [followers, likes] = await Promise.all([
    prisma.follow.groupBy({
      by: ["targetId"],
      where: { targetType, targetId: { in: targetIds } },
      _count: { _all: true },
    }),
    prisma.like.groupBy({
      by: ["targetId"],
      where: { targetType, targetId: { in: targetIds } },
      _count: { _all: true },
    }),
  ]);

  return {
    followers: new Map(followers.map((f) => [f.targetId, f._count._all])),
    likes: new Map(likes.map((l) => [l.targetId, l._count._all])),
  };
}

/** Which of these targets has the given viewer already liked / followed? */
export async function viewerStateFor(
  userId: string | undefined,
  targetType: TargetType,
  targetIds: string[]
) {
  if (!userId || targetIds.length === 0) {
    return { liked: new Set<string>(), followed: new Set<string>() };
  }

  const [likes, follows] = await Promise.all([
    prisma.like.findMany({
      where: { userId, targetType, targetId: { in: targetIds } },
      select: { targetId: true },
    }),
    prisma.follow.findMany({
      where: { userId, targetType, targetId: { in: targetIds } },
      select: { targetId: true },
    }),
  ]);

  return {
    liked: new Set(likes.map((l) => l.targetId)),
    followed: new Set(follows.map((f) => f.targetId)),
  };
}

export type GrowthLevel = "EMERGING" | "GROWING" | "INFLUENTIAL" | "FEATURED";

/** Mirrors the levels described in docs/STYLE.md §16. */
export function growthLevel(followerCount: number, featured: boolean): GrowthLevel {
  if (featured) return "FEATURED";
  if (followerCount >= 1000) return "INFLUENTIAL";
  if (followerCount >= 100) return "GROWING";
  return "EMERGING";
}

export async function ratingFor(targetType: TargetType, targetId: string) {
  const agg = await prisma.review.aggregate({
    where: { targetType, targetId },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return { average: agg._avg.rating, count: agg._count._all };
}
