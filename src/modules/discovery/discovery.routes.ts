import { Router } from "express";
import { z } from "zod";
import { optionalAuth } from "../../middleware/auth.js";
import { validate, validQuery, paginationSchema } from "../../middleware/validate.js";
import { asyncHandler, sendData, param } from "../../utils/http.js";
import * as service from "./discovery.service.js";

export const discoveryRouter = Router();

// Public reads still take optionalAuth so responses can carry viewer state
// (has this user liked/followed this?) without requiring a session.
discoveryRouter.use(optionalAuth);

const listQuery = paginationSchema.extend({
  q: z.string().max(120).optional(),
  categoryId: z.string().optional(),
  location: z.string().max(120).optional(),
  sort: z.enum(["popular", "newest", "featured"]).optional(),
});
type ListQuery = z.infer<typeof listQuery>;

const slugParams = z.object({ slug: z.string().min(1) });

discoveryRouter.get(
  "/categories",
  asyncHandler(async (_req, res) => {
    sendData(res, await service.listCategories());
  })
);

discoveryRouter.get(
  "/creators",
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const q = validQuery<ListQuery>(req);
    const { items, nextCursor } = await service.listCreators({ ...q, viewerId: req.user?.id });
    sendData(res, items, { nextCursor });
  })
);

discoveryRouter.get(
  "/stores",
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const q = validQuery<ListQuery>(req);
    const { items, nextCursor } = await service.listStores({ ...q, viewerId: req.user?.id });
    sendData(res, items, { nextCursor });
  })
);

discoveryRouter.get(
  "/products",
  validate({ query: listQuery.extend({ storeId: z.string().optional() }) }),
  asyncHandler(async (req, res) => {
    const q = validQuery<ListQuery & { storeId?: string }>(req);
    const { items, nextCursor } = await service.listProducts({ ...q, viewerId: req.user?.id });
    sendData(res, items, { nextCursor });
  })
);

discoveryRouter.get(
  "/services",
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const q = validQuery<ListQuery>(req);
    const { items, nextCursor } = await service.listServices({ ...q, viewerId: req.user?.id });
    sendData(res, items, { nextCursor });
  })
);

/** Home feed: recommended creators plus a slice of fresh stores and products. */
discoveryRouter.get(
  "/home",
  asyncHandler(async (req, res) => {
    const viewerId = req.user?.id;
    const [creators, stores, products] = await Promise.all([
      service.recommendedCreators(viewerId, 6),
      service.listStores({ limit: 4, sort: "popular", viewerId }),
      service.listProducts({ limit: 8, sort: "newest", viewerId }),
    ]);
    sendData(res, { creators, stores: stores.items, products: products.items });
  })
);

/** Cross-entity search used by /discover. */
discoveryRouter.get(
  "/search",
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const q = validQuery<ListQuery>(req);
    const viewerId = req.user?.id;
    const opts = { ...q, limit: Math.min(q.limit, 12), viewerId };

    const [creators, stores, products, services] = await Promise.all([
      service.listCreators(opts),
      service.listStores(opts),
      service.listProducts(opts),
      service.listServices(opts),
    ]);

    sendData(res, {
      creators: creators.items,
      stores: stores.items,
      products: products.items,
      services: services.items,
    });
  })
);

discoveryRouter.get(
  "/profiles/:slug",
  validate({ params: slugParams }),
  asyncHandler(async (req, res) => {
    sendData(res, await service.getProfileBySlug(param(req, "slug"), req.user?.id));
  })
);

discoveryRouter.get(
  "/stores/:slug",
  validate({ params: slugParams }),
  asyncHandler(async (req, res) => {
    sendData(res, await service.getStoreBySlug(param(req, "slug"), req.user?.id));
  })
);

discoveryRouter.get(
  "/products/:slug",
  validate({ params: slugParams }),
  asyncHandler(async (req, res) => {
    sendData(res, await service.getProductBySlug(param(req, "slug"), req.user?.id));
  })
);

discoveryRouter.get(
  "/services/:slug",
  validate({ params: slugParams }),
  asyncHandler(async (req, res) => {
    sendData(res, await service.getServiceBySlug(param(req, "slug"), req.user?.id));
  })
);
