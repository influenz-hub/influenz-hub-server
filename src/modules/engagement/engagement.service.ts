import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../utils/api-error.js";
import { cursorArgs, paginate } from "../../utils/http.js";
import { notifyOwner, ownerOf } from "../notifications/notification.service.js";
import { countsFor, ratingFor } from "./counts.js";
import type { TargetType } from "../../generated/prisma/client.js";

/**
 * Every engagement write starts here: a client can name a target, but we verify
 * it exists before creating rows that reference it (nothing enforces the
 * polymorphic targetId at the database level).
 */
async function assertTargetExists(targetType: TargetType, targetId: string) {
  const owner = await ownerOf(targetType, targetId);
  if (owner === null) throw ApiError.notFound(`${targetType.toLowerCase()} not found`);
}

export async function setLike(
  userId: string,
  targetType: TargetType,
  targetId: string,
  liked: boolean
) {
  await assertTargetExists(targetType, targetId);
  const key = { userId_targetType_targetId: { userId, targetType, targetId } };

  if (!liked) {
    await prisma.like.deleteMany({ where: { userId, targetType, targetId } });
  } else {
    const created = await prisma.like.upsert({
      where: key,
      create: { userId, targetType, targetId },
      update: {},
    });
    // Only notify on a genuinely new like, not a repeated call.
    if (created.createdAt.getTime() > Date.now() - 5000) {
      await notifyOwner(targetType, targetId, "LIKE", userId);
    }
  }

  const { likes } = await countsFor(targetType, [targetId]);
  return { liked, likeCount: likes.get(targetId) ?? 0 };
}

export async function setFollow(
  userId: string,
  targetType: TargetType,
  targetId: string,
  following: boolean
) {
  await assertTargetExists(targetType, targetId);
  const key = { userId_targetType_targetId: { userId, targetType, targetId } };

  if (!following) {
    await prisma.follow.deleteMany({ where: { userId, targetType, targetId } });
  } else {
    const created = await prisma.follow.upsert({
      where: key,
      create: { userId, targetType, targetId },
      update: {},
    });
    if (created.createdAt.getTime() > Date.now() - 5000) {
      await notifyOwner(targetType, targetId, "FOLLOW", userId);
    }
  }

  const { followers } = await countsFor(targetType, [targetId]);
  return { following, followerCount: followers.get(targetId) ?? 0 };
}

export async function addComment(
  userId: string,
  targetType: TargetType,
  targetId: string,
  text: string
) {
  await assertTargetExists(targetType, targetId);

  const comment = await prisma.comment.create({
    data: { userId, targetType, targetId, text },
    include: { user: { select: { id: true, name: true, image: true } } },
  });

  await notifyOwner(targetType, targetId, "COMMENT", userId);
  return comment;
}

export async function deleteComment(userId: string, commentId: string) {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw ApiError.notFound("Comment not found");

  // The comment's author or the owner of the thing it's on may remove it.
  const targetOwner = await ownerOf(comment.targetType, comment.targetId);
  if (comment.userId !== userId && targetOwner !== userId) {
    throw ApiError.forbidden();
  }

  await prisma.comment.delete({ where: { id: commentId } });
  return { success: true };
}

export async function listComments(
  targetType: TargetType,
  targetId: string,
  opts: { cursor?: string; limit: number }
) {
  const rows = await prisma.comment.findMany({
    where: { targetType, targetId },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, name: true, image: true } } },
    ...cursorArgs(opts.cursor, opts.limit),
  });
  return paginate(rows, opts.limit);
}

export async function upsertReview(
  userId: string,
  targetType: TargetType,
  targetId: string,
  rating: number,
  text?: string
) {
  await assertTargetExists(targetType, targetId);

  const owner = await ownerOf(targetType, targetId);
  if (owner === userId) throw ApiError.forbidden("You can't review your own listing");

  const review = await prisma.review.upsert({
    where: { userId_targetType_targetId: { userId, targetType, targetId } },
    create: { userId, targetType, targetId, rating, text: text ?? null },
    update: { rating, text: text ?? null },
    include: { user: { select: { id: true, name: true, image: true } } },
  });

  await notifyOwner(targetType, targetId, "REVIEW", userId, { rating });
  return { review, rating: await ratingFor(targetType, targetId) };
}

export async function listReviews(
  targetType: TargetType,
  targetId: string,
  opts: { cursor?: string; limit: number }
) {
  const rows = await prisma.review.findMany({
    where: { targetType, targetId },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, name: true, image: true } } },
    ...cursorArgs(opts.cursor, opts.limit),
  });
  return { ...paginate(rows, opts.limit), rating: await ratingFor(targetType, targetId) };
}

export async function recordView(
  targetType: TargetType,
  targetId: string,
  userId?: string
) {
  await prisma.viewEvent.create({
    data: { targetType, targetId, userId: userId ?? null },
  });
  return { recorded: true };
}
