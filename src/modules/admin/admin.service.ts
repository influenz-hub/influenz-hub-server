import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../utils/api-error.js";
import { cursorArgs, paginate } from "../../utils/http.js";
import { slugify } from "../../utils/slug.js";
import { notify } from "../notifications/notification.service.js";
import { countsFor } from "../engagement/counts.js";
import type { ReportStatus, Role, TargetType } from "../../generated/prisma/client.js";

export async function overview() {
  const [users, businesses, stores, products, openReports, unverified] = await Promise.all([
    prisma.user.count(),
    prisma.profile.count(),
    prisma.store.count(),
    prisma.product.count(),
    prisma.report.count({ where: { status: "OPEN" } }),
    prisma.profile.count({ where: { verified: false } }),
  ]);
  return { users, businesses, stores, products, openReports, unverified };
}

export async function listUsers(opts: { q?: string; cursor?: string; limit: number }) {
  const rows = await prisma.user.findMany({
    where: opts.q
      ? {
          OR: [
            { name: { contains: opts.q, mode: "insensitive" } },
            { email: { contains: opts.q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      image: true,
      role: true,
      createdAt: true,
      profile: { select: { slug: true, businessName: true } },
    },
    ...cursorArgs(opts.cursor, opts.limit),
  });
  return paginate(rows, opts.limit);
}

export async function setUserRole(actingUserId: string, userId: string, role: Role) {
  if (actingUserId === userId) {
    throw ApiError.badRequest("You can't change your own role");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound("User not found");

  // Refuse to remove the last admin, which would lock everyone out of /admin.
  if (user.role === "ADMIN" && role !== "ADMIN") {
    const admins = await prisma.user.count({ where: { role: "ADMIN" } });
    if (admins <= 1) throw ApiError.badRequest("Can't demote the last remaining admin");
  }

  return prisma.user.update({
    where: { id: userId },
    data: { role },
    select: { id: true, name: true, email: true, role: true },
  });
}

export async function listBusinesses(opts: {
  q?: string;
  verified?: boolean;
  cursor?: string;
  limit: number;
}) {
  const rows = await prisma.profile.findMany({
    where: {
      ...(opts.q ? { businessName: { contains: opts.q, mode: "insensitive" } } : {}),
      ...(opts.verified === undefined ? {} : { verified: opts.verified }),
    },
    orderBy: { createdAt: "desc" },
    include: {
      category: { select: { name: true } },
      user: { select: { email: true, name: true } },
      _count: { select: { stores: true, services: true } },
    },
    ...cursorArgs(opts.cursor, opts.limit),
  });

  const { items, nextCursor } = paginate(rows, opts.limit);
  const { followers } = await countsFor("PROFILE", items.map((p) => p.id));

  return {
    items: items.map((p) => ({ ...p, followerCount: followers.get(p.id) ?? 0 })),
    nextCursor,
  };
}

export async function setProfileFlag(
  profileId: string,
  flag: "verified" | "featured",
  value: boolean
) {
  const profile = await prisma.profile.findUnique({ where: { id: profileId } });
  if (!profile) throw ApiError.notFound("Business not found");

  const updated = await prisma.profile.update({
    where: { id: profileId },
    data: { [flag]: value },
  });

  // Only celebrate the transition into the state, not out of it.
  if (value && !profile[flag]) {
    await notify(updated.userId, flag === "verified" ? "VERIFIED" : "FEATURED", {
      targetLabel: updated.businessName,
      profileSlug: updated.slug,
    });
  }

  return updated;
}

export async function createCategory(name: string, icon?: string) {
  return prisma.category.create({
    data: { name, slug: slugify(name), icon: icon ?? null },
  });
}

export async function deleteCategory(id: string) {
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { profiles: true, stores: true, products: true, services: true } } },
  });
  if (!category) throw ApiError.notFound("Category not found");

  const inUse =
    category._count.profiles + category._count.stores + category._count.products + category._count.services;
  if (inUse > 0) {
    throw ApiError.conflict(`That category is still used by ${inUse} listing(s)`);
  }

  await prisma.category.delete({ where: { id } });
  return { success: true };
}

export async function listCategoriesWithUsage() {
  const rows = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { profiles: true, stores: true, products: true, services: true } } },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    icon: c.icon,
    usage: c._count.profiles + c._count.stores + c._count.products + c._count.services,
  }));
}

export async function listReports(opts: { status?: ReportStatus; cursor?: string; limit: number }) {
  const rows = await prisma.report.findMany({
    where: opts.status ? { status: opts.status } : undefined,
    orderBy: { createdAt: "desc" },
    include: { reporter: { select: { id: true, name: true, email: true } } },
    ...cursorArgs(opts.cursor, opts.limit),
  });
  return paginate(rows, opts.limit);
}

export async function updateReportStatus(id: string, status: ReportStatus) {
  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) throw ApiError.notFound("Report not found");
  return prisma.report.update({ where: { id }, data: { status } });
}

export async function createReport(
  reporterId: string,
  targetType: TargetType,
  targetId: string,
  reason: string
) {
  return prisma.report.create({
    data: { reporterId, targetType, targetId, reason },
  });
}
