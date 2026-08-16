import { prisma } from "../../lib/prisma.js";
import { cursorArgs, paginate } from "../../utils/http.js";
import type {
  NotificationType,
  Prisma,
  TargetType,
} from "../../generated/prisma/client.js";

export async function notify(
  userId: string,
  type: NotificationType,
  payload: Record<string, unknown> = {}
) {
  await prisma.notification.create({
    data: { userId, type, payload: payload as Prisma.InputJsonValue },
  });
}

/** Resolves the owning user for any engageable target. */
export async function ownerOf(targetType: TargetType, targetId: string): Promise<string | null> {
  switch (targetType) {
    case "PROFILE": {
      const row = await prisma.profile.findUnique({
        where: { id: targetId },
        select: { userId: true },
      });
      return row?.userId ?? null;
    }
    case "STORE": {
      const row = await prisma.store.findUnique({
        where: { id: targetId },
        select: { profile: { select: { userId: true } } },
      });
      return row?.profile.userId ?? null;
    }
    case "PRODUCT": {
      const row = await prisma.product.findUnique({
        where: { id: targetId },
        select: { store: { select: { profile: { select: { userId: true } } } } },
      });
      return row?.store.profile.userId ?? null;
    }
    case "SERVICE": {
      const row = await prisma.service.findUnique({
        where: { id: targetId },
        select: { profile: { select: { userId: true } } },
      });
      return row?.profile.userId ?? null;
    }
    case "POST": {
      const row = await prisma.post.findUnique({
        where: { id: targetId },
        select: { profile: { select: { userId: true } } },
      });
      return row?.profile.userId ?? null;
    }
  }
}

/** Notifies a target's owner, skipping self-directed noise. */
export async function notifyOwner(
  targetType: TargetType,
  targetId: string,
  type: NotificationType,
  actingUserId: string,
  payload: Record<string, unknown> = {}
) {
  const ownerId = await ownerOf(targetType, targetId);
  if (!ownerId || ownerId === actingUserId) return;

  const actor = await prisma.user.findUnique({
    where: { id: actingUserId },
    select: { name: true, image: true },
  });

  await notify(ownerId, type, {
    ...payload,
    actorName: actor?.name ?? "Someone",
    actorImage: actor?.image ?? null,
    targetType,
    targetId,
  });
}

export async function listNotifications(
  userId: string,
  opts: { cursor?: string; limit: number }
) {
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    ...cursorArgs(opts.cursor, opts.limit),
  });
  return paginate(rows, opts.limit);
}

export function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, read: false } });
}

export async function markAllRead(userId: string) {
  const { count } = await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
  return { updated: count };
}
