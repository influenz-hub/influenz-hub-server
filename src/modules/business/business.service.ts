import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../utils/api-error.js";
import { uniqueSlug } from "../../utils/slug.js";
import { countsFor, growthLevel } from "../engagement/counts.js";
import { notify } from "../notifications/notification.service.js";
import type {
  profileSchema,
  storeSchema,
  productSchema,
  serviceSchema,
  postSchema,
} from "./business.schema.js";

type ProfileInput = z.infer<typeof profileSchema>;
type StoreInput = z.infer<typeof storeSchema>;
type ProductInput = z.infer<typeof productSchema>;
type ServiceInput = z.infer<typeof serviceSchema>;
type PostInput = z.infer<typeof postSchema>;

const blank = (v: string | undefined) => (v === "" ? null : (v ?? null));

/**
 * Ownership is always re-derived from the authenticated user id. Routes never
 * pass a profile id from the client, so a caller can't act on someone else's
 * business by guessing identifiers.
 */
async function requireProfile(userId: string) {
  const profile = await prisma.profile.findUnique({ where: { userId } });
  if (!profile) {
    throw ApiError.badRequest("Create your business profile first");
  }
  return profile;
}

async function requireOwnedStore(userId: string, storeId: string) {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: { profile: { select: { userId: true } } },
  });
  if (!store) throw ApiError.notFound("Store not found");
  if (store.profile.userId !== userId) throw ApiError.forbidden();
  return store;
}

// ---------- Profile ----------

export async function getMyProfile(userId: string) {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    include: {
      category: true,
      stores: { include: { _count: { select: { products: true } } }, orderBy: { createdAt: "desc" } },
      services: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!profile) return null;

  const { followers, likes } = await countsFor("PROFILE", [profile.id]);
  const followerCount = followers.get(profile.id) ?? 0;

  return {
    ...profile,
    followerCount,
    likeCount: likes.get(profile.id) ?? 0,
    growthLevel: growthLevel(followerCount, profile.featured),
    services: profile.services.map((s) => ({
      ...s,
      priceMin: s.priceMin?.toString() ?? null,
      priceMax: s.priceMax?.toString() ?? null,
    })),
  };
}

export async function upsertProfile(userId: string, input: ProfileInput) {
  const existing = await prisma.profile.findUnique({ where: { userId } });

  const data = {
    businessName: input.businessName,
    description: blank(input.description),
    categoryId: blank(input.categoryId),
    location: blank(input.location),
    contactEmail: blank(input.contactEmail),
    contactPhone: blank(input.contactPhone),
    logo: blank(input.logo),
    banner: blank(input.banner),
    ...(input.socialLinks ? { socialLinks: input.socialLinks } : {}),
  };

  if (existing) {
    return prisma.profile.update({ where: { userId }, data });
  }

  const slug = await uniqueSlug(
    input.businessName,
    async (s) => (await prisma.profile.count({ where: { slug: s } })) > 0
  );

  // Creating a profile is what turns a viewer into a business account.
  const [profile] = await prisma.$transaction([
    prisma.profile.create({ data: { ...data, userId, slug } }),
    prisma.user.update({ where: { id: userId }, data: { role: "BUSINESS" } }),
  ]);

  return profile;
}

// ---------- Stores ----------

export async function createStore(userId: string, input: StoreInput) {
  const profile = await requireProfile(userId);
  const slug = await uniqueSlug(
    input.name,
    async (s) => (await prisma.store.count({ where: { slug: s } })) > 0
  );

  return prisma.store.create({
    data: {
      profileId: profile.id,
      slug,
      name: input.name,
      description: blank(input.description),
      categoryId: blank(input.categoryId),
      location: blank(input.location),
      contactInfo: blank(input.contactInfo),
      images: input.images,
      ...(input.openingHours ? { openingHours: input.openingHours } : {}),
    },
  });
}

export async function updateStore(userId: string, storeId: string, input: StoreInput) {
  await requireOwnedStore(userId, storeId);
  return prisma.store.update({
    where: { id: storeId },
    data: {
      name: input.name,
      description: blank(input.description),
      categoryId: blank(input.categoryId),
      location: blank(input.location),
      contactInfo: blank(input.contactInfo),
      images: input.images,
      ...(input.openingHours ? { openingHours: input.openingHours } : {}),
    },
  });
}

export async function deleteStore(userId: string, storeId: string) {
  await requireOwnedStore(userId, storeId);
  await prisma.store.delete({ where: { id: storeId } });
  return { success: true };
}

export async function listMyStores(userId: string) {
  const profile = await requireProfile(userId);
  const stores = await prisma.store.findMany({
    where: { profileId: profile.id },
    include: { category: true, _count: { select: { products: true } } },
    orderBy: { createdAt: "desc" },
  });

  const { likes, followers } = await countsFor("STORE", stores.map((s) => s.id));
  return stores.map((s) => ({
    ...s,
    productCount: s._count.products,
    likeCount: likes.get(s.id) ?? 0,
    followerCount: followers.get(s.id) ?? 0,
  }));
}

// ---------- Products ----------

export async function listStoreProducts(userId: string, storeId: string) {
  const store = await requireOwnedStore(userId, storeId);
  const products = await prisma.product.findMany({
    where: { storeId: store.id },
    include: { category: true },
    orderBy: { createdAt: "desc" },
  });
  return {
    store: { id: store.id, name: store.name, slug: store.slug },
    products: products.map((p) => ({ ...p, price: p.price.toString() })),
  };
}

export async function createProduct(userId: string, storeId: string, input: ProductInput) {
  const store = await requireOwnedStore(userId, storeId);
  const slug = await uniqueSlug(
    input.name,
    async (s) => (await prisma.product.count({ where: { slug: s } })) > 0
  );

  const product = await prisma.product.create({
    data: {
      storeId: store.id,
      slug,
      name: input.name,
      description: blank(input.description),
      categoryId: blank(input.categoryId),
      price: input.price,
      stock: input.stock,
      available: input.available,
      images: input.images,
    },
  });

  // Followers of the store asked to hear about new products.
  const followers = await prisma.follow.findMany({
    where: { targetType: "STORE", targetId: store.id },
    select: { userId: true },
  });
  await Promise.all(
    followers.map((f) =>
      notify(f.userId, "NEW_PRODUCT", {
        targetLabel: product.name,
        targetType: "PRODUCT",
        targetId: product.id,
        slug: product.slug,
      })
    )
  );

  return { ...product, price: product.price.toString() };
}

export async function updateProduct(userId: string, productId: string, input: ProductInput) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { storeId: true },
  });
  if (!product) throw ApiError.notFound("Product not found");
  await requireOwnedStore(userId, product.storeId);

  const updated = await prisma.product.update({
    where: { id: productId },
    data: {
      name: input.name,
      description: blank(input.description),
      categoryId: blank(input.categoryId),
      price: input.price,
      stock: input.stock,
      available: input.available,
      images: input.images,
    },
  });
  return { ...updated, price: updated.price.toString() };
}

export async function deleteProduct(userId: string, productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { storeId: true },
  });
  if (!product) throw ApiError.notFound("Product not found");
  await requireOwnedStore(userId, product.storeId);

  await prisma.product.delete({ where: { id: productId } });
  return { success: true };
}

// ---------- Services ----------

export async function createService(userId: string, input: ServiceInput) {
  const profile = await requireProfile(userId);
  const slug = await uniqueSlug(
    input.name,
    async (s) => (await prisma.service.count({ where: { slug: s } })) > 0
  );

  const service = await prisma.service.create({
    data: {
      profileId: profile.id,
      slug,
      name: input.name,
      description: blank(input.description),
      categoryId: blank(input.categoryId),
      priceMin: input.priceMin ?? null,
      priceMax: input.priceMax ?? null,
      contactMethod: blank(input.contactMethod),
      images: input.images,
    },
  });
  return { ...service, priceMin: service.priceMin?.toString() ?? null, priceMax: service.priceMax?.toString() ?? null };
}

export async function updateService(userId: string, serviceId: string, input: ServiceInput) {
  const profile = await requireProfile(userId);
  const existing = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!existing) throw ApiError.notFound("Service not found");
  if (existing.profileId !== profile.id) throw ApiError.forbidden();

  const service = await prisma.service.update({
    where: { id: serviceId },
    data: {
      name: input.name,
      description: blank(input.description),
      categoryId: blank(input.categoryId),
      priceMin: input.priceMin ?? null,
      priceMax: input.priceMax ?? null,
      contactMethod: blank(input.contactMethod),
      images: input.images,
    },
  });
  return { ...service, priceMin: service.priceMin?.toString() ?? null, priceMax: service.priceMax?.toString() ?? null };
}

export async function deleteService(userId: string, serviceId: string) {
  const profile = await requireProfile(userId);
  const existing = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!existing) throw ApiError.notFound("Service not found");
  if (existing.profileId !== profile.id) throw ApiError.forbidden();

  await prisma.service.delete({ where: { id: serviceId } });
  return { success: true };
}

// ---------- Posts ----------

export async function listMyPosts(userId: string) {
  const profile = await requireProfile(userId);
  return prisma.post.findMany({
    where: { profileId: profile.id },
    orderBy: { createdAt: "desc" },
    include: {
      store: { select: { slug: true, name: true } },
      product: { select: { slug: true, name: true } },
    },
  });
}

export async function createPost(userId: string, input: PostInput) {
  const profile = await requireProfile(userId);

  // A post may only reference the author's own store/product.
  if (input.storeId) await requireOwnedStore(userId, input.storeId);
  if (input.productId) {
    const product = await prisma.product.findUnique({
      where: { id: input.productId },
      select: { storeId: true },
    });
    if (!product) throw ApiError.notFound("Product not found");
    await requireOwnedStore(userId, product.storeId);
  }

  const post = await prisma.post.create({
    data: {
      profileId: profile.id,
      text: input.text,
      images: input.images,
      storeId: blank(input.storeId),
      productId: blank(input.productId),
    },
  });

  const followers = await prisma.follow.findMany({
    where: { targetType: "PROFILE", targetId: profile.id },
    select: { userId: true },
  });
  await Promise.all(
    followers.map((f) =>
      notify(f.userId, "NEW_POST", {
        actorName: profile.businessName,
        targetType: "POST",
        targetId: post.id,
        profileSlug: profile.slug,
      })
    )
  );

  return post;
}

export async function deletePost(userId: string, postId: string) {
  const profile = await requireProfile(userId);
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw ApiError.notFound("Post not found");
  if (post.profileId !== profile.id) throw ApiError.forbidden();

  await prisma.post.delete({ where: { id: postId } });
  return { success: true };
}

// ---------- Stats ----------

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Daily series for the dashboard chart, zero-filled so gaps render flat. */
export async function getMyStats(userId: string, days = 14) {
  const profile = await requireProfile(userId);
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);

  const [views, follows, likes, totals, productCount] = await Promise.all([
    prisma.viewEvent.findMany({
      where: { targetType: "PROFILE", targetId: profile.id, createdAt: { gte: since } },
      select: { createdAt: true },
    }),
    prisma.follow.findMany({
      where: { targetType: "PROFILE", targetId: profile.id, createdAt: { gte: since } },
      select: { createdAt: true },
    }),
    prisma.like.findMany({
      where: { targetType: "PROFILE", targetId: profile.id, createdAt: { gte: since } },
      select: { createdAt: true },
    }),
    countsFor("PROFILE", [profile.id]),
    prisma.product.count({ where: { store: { profileId: profile.id } } }),
  ]);

  const buckets = new Map<string, { day: string; views: number; follows: number; likes: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    buckets.set(dayKey(d), { day: dayKey(d), views: 0, follows: 0, likes: 0 });
  }

  for (const v of views) {
    const b = buckets.get(dayKey(v.createdAt));
    if (b) b.views++;
  }
  for (const f of follows) {
    const b = buckets.get(dayKey(f.createdAt));
    if (b) b.follows++;
  }
  for (const l of likes) {
    const b = buckets.get(dayKey(l.createdAt));
    if (b) b.likes++;
  }

  const totalViews = await prisma.viewEvent.count({
    where: { targetType: "PROFILE", targetId: profile.id },
  });

  return {
    series: [...buckets.values()],
    totals: {
      followers: totals.followers.get(profile.id) ?? 0,
      likes: totals.likes.get(profile.id) ?? 0,
      views: totalViews,
      products: productCount,
    },
  };
}
