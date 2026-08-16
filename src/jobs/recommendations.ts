import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

/**
 * Rule-based recommendations: score every profile a user doesn't already follow
 * by how well it matches what they've engaged with, how fresh it is, and how
 * popular it is overall. Deliberately simple and explainable — no ML.
 */
const RECENCY_HALF_LIFE_DAYS = 21;
const WEIGHTS = { categoryAffinity: 5, recency: 3, popularity: 2, featured: 1 };
const PER_USER_LIMIT = 20;

function recencyScore(createdAt: Date) {
  const ageDays = (Date.now() - createdAt.getTime()) / 86_400_000;
  return Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
}

export async function generateRecommendations() {
  const started = Date.now();

  const [profiles, follows, likes, users] = await Promise.all([
    prisma.profile.findMany({
      select: { id: true, categoryId: true, createdAt: true, featured: true },
    }),
    prisma.follow.findMany({ where: { targetType: "PROFILE" } }),
    prisma.like.findMany({ where: { targetType: "PROFILE" } }),
    prisma.user.findMany({ select: { id: true } }),
  ]);

  if (profiles.length === 0) {
    logger.info("[recommendations] no profiles yet, nothing to do");
    return { users: 0, written: 0 };
  }

  const followerCounts = new Map<string, number>();
  for (const f of follows) followerCounts.set(f.targetId, (followerCounts.get(f.targetId) ?? 0) + 1);

  const likeCounts = new Map<string, number>();
  for (const l of likes) likeCounts.set(l.targetId, (likeCounts.get(l.targetId) ?? 0) + 1);

  // Normalize popularity against the most popular profile so the term stays 0..1
  // regardless of overall platform scale.
  const maxPopularity = Math.max(
    1,
    ...profiles.map((p) => (followerCounts.get(p.id) ?? 0) + (likeCounts.get(p.id) ?? 0))
  );

  const followsByUser = new Map<string, Set<string>>();
  for (const f of follows) {
    const set = followsByUser.get(f.userId) ?? new Set<string>();
    set.add(f.targetId);
    followsByUser.set(f.userId, set);
  }

  const likesByUser = new Map<string, string[]>();
  for (const l of likes) {
    likesByUser.set(l.userId, [...(likesByUser.get(l.userId) ?? []), l.targetId]);
  }

  const categoryById = new Map(profiles.map((p) => [p.id, p.categoryId]));
  let written = 0;

  for (const user of users) {
    const followed = followsByUser.get(user.id) ?? new Set<string>();
    const engaged = [...followed, ...(likesByUser.get(user.id) ?? [])];

    const preferredCategories = new Set(
      engaged.map((id) => categoryById.get(id)).filter((c): c is string => Boolean(c))
    );

    const scored = profiles
      .filter((p) => !followed.has(p.id))
      .map((p) => {
        const affinity = p.categoryId && preferredCategories.has(p.categoryId) ? 1 : 0;
        const popularity =
          ((followerCounts.get(p.id) ?? 0) + (likeCounts.get(p.id) ?? 0)) / maxPopularity;

        return {
          targetId: p.id,
          score:
            affinity * WEIGHTS.categoryAffinity +
            recencyScore(p.createdAt) * WEIGHTS.recency +
            popularity * WEIGHTS.popularity +
            (p.featured ? WEIGHTS.featured : 0),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, PER_USER_LIMIT);

    // Replace atomically so readers never observe a half-written set.
    await prisma.$transaction([
      prisma.recommendation.deleteMany({ where: { userId: user.id, targetType: "PROFILE" } }),
      prisma.recommendation.createMany({
        data: scored.map((s) => ({
          userId: user.id,
          targetType: "PROFILE" as const,
          targetId: s.targetId,
          score: s.score,
        })),
      }),
    ]);

    written += scored.length;
  }

  const result = { users: users.length, written, ms: Date.now() - started };
  logger.info(result, "[recommendations] complete");
  return result;
}
