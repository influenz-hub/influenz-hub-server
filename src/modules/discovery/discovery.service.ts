import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../utils/api-error.js";
import { cursorArgs, paginate } from "../../utils/http.js";
import { countsFor, growthLevel, ratingFor, viewerStateFor } from "../engagement/counts.js";
import type { Prisma } from "../../generated/prisma/client.js";

export type SortOption = "popular" | "newest" | "featured";
export type ListOpts = {
  q?: string;
  categoryId?: string;
  location?: string;
  sort?: SortOption;
  cursor?: string;
  limit: number;
  viewerId?: string;
};

const search = (q?: string) =>
  q ? ({ contains: q, mode: "insensitive" } as const) : undefined;

const profileCard = {
  id: true,
  slug: true,
  businessName: true,
  description: true,
  logo: true,
  banner: true,
  location: true,
  verified: true,
  featured: true,
  createdAt: true,
  category: { select: { id: true, name: true, slug: true } },
  _count: { select: { stores: true, services: true } },
} satisfies Prisma.ProfileSelect;

/**
 * "Popular" can't be an ORDER BY — follower counts live in a separate
 * polymorphic table. We over-fetch a window, decorate with counts, then sort in
 * memory. Cursor pagination still works because ordering within a page is
 * stable and the cursor tracks the underlying id sequence.
 */
export async function listCreators(opts: ListOpts) {
  const where: Prisma.ProfileWhereInput = {
    ...(opts.q ? { businessName: search(opts.q) } : {}),
    ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
    ...(opts.location ? { location: search(opts.location) } : {}),
    ...(opts.sort === "featured" ? { featured: true } : {}),
  };

  const rows = await prisma.profile.findMany({
    where,
    select: profileCard,
    orderBy: opts.sort === "featured" ? [{ featured: "desc" }, { createdAt: "desc" }] : { createdAt: "desc" },
    ...cursorArgs(opts.cursor, opts.limit),
  });

  const { items, nextCursor } = paginate(rows, opts.limit);
  const ids = items.map((p) => p.id);
  const [{ followers, likes }, viewer] = await Promise.all([
    countsFor("PROFILE", ids),
    viewerStateFor(opts.viewerId, "PROFILE", ids),
  ]);

  const decorated = items.map((p) => {
    const followerCount = followers.get(p.id) ?? 0;
    return {
      ...p,
      followerCount,
      likeCount: likes.get(p.id) ?? 0,
      storeCount: p._count.stores,
      serviceCount: p._count.services,
      growthLevel: growthLevel(followerCount, p.featured),
      viewerIsFollowing: viewer.followed.has(p.id),
    };
  });

  if (opts.sort === "popular" || !opts.sort) {
    decorated.sort((a, b) => b.followerCount - a.followerCount);
  }

  return { items: decorated, nextCursor };
}

const storeCard = {
  id: true,
  slug: true,
  name: true,
  description: true,
  images: true,
  location: true,
  createdAt: true,
  category: { select: { id: true, name: true, slug: true } },
  profile: { select: { slug: true, businessName: true, verified: true, logo: true } },
  _count: { select: { products: true } },
} satisfies Prisma.StoreSelect;

export async function listStores(opts: ListOpts) {
  const where: Prisma.StoreWhereInput = {
    ...(opts.q ? { name: search(opts.q) } : {}),
    ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
    ...(opts.location ? { location: search(opts.location) } : {}),
    ...(opts.sort === "featured" ? { profile: { featured: true } } : {}),
  };

  const rows = await prisma.store.findMany({
    where,
    select: storeCard,
    orderBy: { createdAt: "desc" },
    ...cursorArgs(opts.cursor, opts.limit),
  });

  const { items, nextCursor } = paginate(rows, opts.limit);
  const ids = items.map((s) => s.id);
  const [{ likes, followers }, viewer] = await Promise.all([
    countsFor("STORE", ids),
    viewerStateFor(opts.viewerId, "STORE", ids),
  ]);

  const decorated = items.map((s) => ({
    ...s,
    likeCount: likes.get(s.id) ?? 0,
    followerCount: followers.get(s.id) ?? 0,
    productCount: s._count.products,
    viewerHasLiked: viewer.liked.has(s.id),
  }));

  if (opts.sort === "popular" || !opts.sort) {
    decorated.sort((a, b) => b.likeCount - a.likeCount);
  }

  return { items: decorated, nextCursor };
}

const productCard = {
  id: true,
  slug: true,
  name: true,
  description: true,
  images: true,
  price: true,
  stock: true,
  available: true,
  createdAt: true,
  category: { select: { id: true, name: true, slug: true } },
  store: { select: { slug: true, name: true, profile: { select: { slug: true, businessName: true } } } },
} satisfies Prisma.ProductSelect;

export async function listProducts(opts: ListOpts & { storeId?: string }) {
  const where: Prisma.ProductWhereInput = {
    ...(opts.q ? { name: search(opts.q) } : {}),
    ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
    ...(opts.storeId ? { storeId: opts.storeId } : {}),
  };

  const rows = await prisma.product.findMany({
    where,
    select: productCard,
    orderBy: { createdAt: "desc" },
    ...cursorArgs(opts.cursor, opts.limit),
  });

  const { items, nextCursor } = paginate(rows, opts.limit);
  const ids = items.map((p) => p.id);
  const [{ likes }, viewer] = await Promise.all([
    countsFor("PRODUCT", ids),
    viewerStateFor(opts.viewerId, "PRODUCT", ids),
  ]);

  const decorated = items.map((p) => ({
    ...p,
    price: p.price.toString(),
    likeCount: likes.get(p.id) ?? 0,
    viewerHasLiked: viewer.liked.has(p.id),
  }));

  if (opts.sort === "popular") decorated.sort((a, b) => b.likeCount - a.likeCount);

  return { items: decorated, nextCursor };
}

const serviceCard = {
  id: true,
  slug: true,
  name: true,
  description: true,
  images: true,
  priceMin: true,
  priceMax: true,
  contactMethod: true,
  createdAt: true,
  category: { select: { id: true, name: true, slug: true } },
  profile: { select: { slug: true, businessName: true, verified: true, logo: true } },
} satisfies Prisma.ServiceSelect;

export async function listServices(opts: ListOpts) {
  const where: Prisma.ServiceWhereInput = {
    ...(opts.q ? { name: search(opts.q) } : {}),
    ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
  };

  const rows = await prisma.service.findMany({
    where,
    select: serviceCard,
    orderBy: { createdAt: "desc" },
    ...cursorArgs(opts.cursor, opts.limit),
  });

  const { items, nextCursor } = paginate(rows, opts.limit);
  const ids = items.map((s) => s.id);
  const [{ likes }, viewer] = await Promise.all([
    countsFor("SERVICE", ids),
    viewerStateFor(opts.viewerId, "SERVICE", ids),
  ]);

  return {
    items: items.map((s) => ({
      ...s,
      priceMin: s.priceMin?.toString() ?? null,
      priceMax: s.priceMax?.toString() ?? null,
      likeCount: likes.get(s.id) ?? 0,
      viewerHasLiked: viewer.liked.has(s.id),
    })),
    nextCursor,
  };
}

// ---------- Detail ----------

export async function getProfileBySlug(slug: string, viewerId?: string) {
  const profile = await prisma.profile.findUnique({
    where: { slug },
    include: {
      category: true,
      stores: {
        include: {
          category: true,
          profile: { select: { slug: true, businessName: true, verified: true, logo: true } },
          _count: { select: { products: true } },
        },
      },
      services: { include: { category: true } },
      posts: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          store: { select: { slug: true, name: true } },
          product: { select: { slug: true, name: true } },
        },
      },
    },
  });
  if (!profile) throw ApiError.notFound("Creator not found");

  const [{ followers, likes }, viewer, views, storeCounts] = await Promise.all([
    countsFor("PROFILE", [profile.id]),
    viewerStateFor(viewerId, "PROFILE", [profile.id]),
    prisma.viewEvent.count({ where: { targetType: "PROFILE", targetId: profile.id } }),
    countsFor("STORE", profile.stores.map((s) => s.id)),
  ]);

  const followerCount = followers.get(profile.id) ?? 0;

  return {
    ...profile,
    followerCount,
    likeCount: likes.get(profile.id) ?? 0,
    viewCount: views,
    growthLevel: growthLevel(followerCount, profile.featured),
    viewerIsFollowing: viewer.followed.has(profile.id),
    viewerHasLiked: viewer.liked.has(profile.id),
    stores: profile.stores.map((s) => ({
      ...s,
      likeCount: storeCounts.likes.get(s.id) ?? 0,
      productCount: s._count.products,
    })),
    services: profile.services.map((s) => ({
      ...s,
      priceMin: s.priceMin?.toString() ?? null,
      priceMax: s.priceMax?.toString() ?? null,
    })),
  };
}

export async function getStoreBySlug(slug: string, viewerId?: string) {
  const store = await prisma.store.findUnique({
    where: { slug },
    include: {
      category: true,
      profile: { select: { id: true, slug: true, businessName: true, verified: true, logo: true } },
      products: { orderBy: { createdAt: "desc" }, include: { category: true } },
      posts: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { profile: { select: { slug: true, businessName: true, logo: true } } },
      },
    },
  });
  if (!store) throw ApiError.notFound("Store not found");

  const [{ followers, likes }, viewer, rating, views] = await Promise.all([
    countsFor("STORE", [store.id]),
    viewerStateFor(viewerId, "STORE", [store.id]),
    ratingFor("STORE", store.id),
    prisma.viewEvent.count({ where: { targetType: "STORE", targetId: store.id } }),
  ]);

  return {
    ...store,
    products: store.products.map((p) => ({ ...p, price: p.price.toString() })),
    followerCount: followers.get(store.id) ?? 0,
    likeCount: likes.get(store.id) ?? 0,
    viewCount: views,
    rating,
    viewerIsFollowing: viewer.followed.has(store.id),
    viewerHasLiked: viewer.liked.has(store.id),
  };
}

export async function getProductBySlug(slug: string, viewerId?: string) {
  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      category: true,
      store: {
        select: {
          id: true,
          slug: true,
          name: true,
          profile: { select: { slug: true, businessName: true, verified: true, logo: true } },
        },
      },
    },
  });
  if (!product) throw ApiError.notFound("Product not found");

  const [{ likes }, viewer, rating, related] = await Promise.all([
    countsFor("PRODUCT", [product.id]),
    viewerStateFor(viewerId, "PRODUCT", [product.id]),
    ratingFor("PRODUCT", product.id),
    prisma.product.findMany({
      where: { storeId: product.storeId, id: { not: product.id } },
      take: 4,
      orderBy: { createdAt: "desc" },
      select: { id: true, slug: true, name: true, images: true, price: true, available: true },
    }),
  ]);

  return {
    ...product,
    price: product.price.toString(),
    likeCount: likes.get(product.id) ?? 0,
    rating,
    viewerHasLiked: viewer.liked.has(product.id),
    related: related.map((r) => ({ ...r, price: r.price.toString() })),
  };
}

export async function getServiceBySlug(slug: string, viewerId?: string) {
  const service = await prisma.service.findUnique({
    where: { slug },
    include: {
      category: true,
      profile: { select: { id: true, slug: true, businessName: true, verified: true, logo: true } },
    },
  });
  if (!service) throw ApiError.notFound("Service not found");

  const [{ likes }, viewer, rating] = await Promise.all([
    countsFor("SERVICE", [service.id]),
    viewerStateFor(viewerId, "SERVICE", [service.id]),
    ratingFor("SERVICE", service.id),
  ]);

  return {
    ...service,
    priceMin: service.priceMin?.toString() ?? null,
    priceMax: service.priceMax?.toString() ?? null,
    likeCount: likes.get(service.id) ?? 0,
    rating,
    viewerHasLiked: viewer.liked.has(service.id),
  };
}

// ---------- Home / recommendations ----------

/**
 * Personalized when the batch job has produced rows for this user, trending
 * otherwise — so a brand-new account still gets a populated home page.
 */
export async function recommendedCreators(viewerId: string | undefined, limit: number) {
  if (viewerId) {
    const recs = await prisma.recommendation.findMany({
      where: { userId: viewerId, targetType: "PROFILE" },
      orderBy: { score: "desc" },
      take: limit,
    });

    if (recs.length > 0) {
      const rows = await prisma.profile.findMany({
        where: { id: { in: recs.map((r) => r.targetId) } },
        select: profileCard,
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      const ordered = recs.map((r) => byId.get(r.targetId)).filter((p) => p !== undefined);

      const { followers, likes } = await countsFor("PROFILE", ordered.map((p) => p.id));
      return ordered.map((p) => {
        const followerCount = followers.get(p.id) ?? 0;
        return {
          ...p,
          followerCount,
          likeCount: likes.get(p.id) ?? 0,
          storeCount: p._count.stores,
          serviceCount: p._count.services,
          growthLevel: growthLevel(followerCount, p.featured),
          personalized: true,
        };
      });
    }
  }

  const { items } = await listCreators({ limit, sort: "popular", viewerId });
  return items.map((i) => ({ ...i, personalized: false }));
}

export function listCategories() {
  return prisma.category.findMany({ orderBy: { name: "asc" } });
}
