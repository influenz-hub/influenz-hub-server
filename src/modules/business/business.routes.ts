import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { validate, validQuery, paginationSchema } from "../../middleware/validate.js";
import { asyncHandler, sendData, param } from "../../utils/http.js";
import * as service from "./business.service.js";
import * as notifications from "../notifications/notification.service.js";
import {
  profileSchema,
  storeSchema,
  productSchema,
  serviceSchema,
  postSchema,
} from "./business.schema.js";

export const businessRouter = Router();

// Everything under /me is owner-scoped by definition.
businessRouter.use(requireAuth);

// ---------- Profile ----------

businessRouter.get(
  "/profile",
  asyncHandler(async (req, res) => {
    sendData(res, await service.getMyProfile(req.user!.id));
  })
);

businessRouter.put(
  "/profile",
  validate({ body: profileSchema }),
  asyncHandler(async (req, res) => {
    sendData(res, await service.upsertProfile(req.user!.id, req.body));
  })
);

// ---------- Stores ----------

businessRouter.get(
  "/stores",
  asyncHandler(async (req, res) => {
    sendData(res, await service.listMyStores(req.user!.id));
  })
);

businessRouter.post(
  "/stores",
  validate({ body: storeSchema }),
  asyncHandler(async (req, res) => {
    sendData(res, await service.createStore(req.user!.id, req.body), undefined, 201);
  })
);

businessRouter.put(
  "/stores/:id",
  validate({ body: storeSchema }),
  asyncHandler(async (req, res) => {
    sendData(res, await service.updateStore(req.user!.id, param(req, "id"), req.body));
  })
);

businessRouter.delete(
  "/stores/:id",
  asyncHandler(async (req, res) => {
    sendData(res, await service.deleteStore(req.user!.id, param(req, "id")));
  })
);

// ---------- Products (nested under their store) ----------

businessRouter.get(
  "/stores/:id/products",
  asyncHandler(async (req, res) => {
    sendData(res, await service.listStoreProducts(req.user!.id, param(req, "id")));
  })
);

businessRouter.post(
  "/stores/:id/products",
  validate({ body: productSchema }),
  asyncHandler(async (req, res) => {
    sendData(res, await service.createProduct(req.user!.id, param(req, "id"), req.body), undefined, 201);
  })
);

businessRouter.put(
  "/products/:id",
  validate({ body: productSchema }),
  asyncHandler(async (req, res) => {
    sendData(res, await service.updateProduct(req.user!.id, param(req, "id"), req.body));
  })
);

businessRouter.delete(
  "/products/:id",
  asyncHandler(async (req, res) => {
    sendData(res, await service.deleteProduct(req.user!.id, param(req, "id")));
  })
);

// ---------- Services ----------

businessRouter.post(
  "/services",
  validate({ body: serviceSchema }),
  asyncHandler(async (req, res) => {
    sendData(res, await service.createService(req.user!.id, req.body), undefined, 201);
  })
);

businessRouter.put(
  "/services/:id",
  validate({ body: serviceSchema }),
  asyncHandler(async (req, res) => {
    sendData(res, await service.updateService(req.user!.id, param(req, "id"), req.body));
  })
);

businessRouter.delete(
  "/services/:id",
  asyncHandler(async (req, res) => {
    sendData(res, await service.deleteService(req.user!.id, param(req, "id")));
  })
);

// ---------- Posts ----------

businessRouter.get(
  "/posts",
  asyncHandler(async (req, res) => {
    sendData(res, await service.listMyPosts(req.user!.id));
  })
);

businessRouter.post(
  "/posts",
  validate({ body: postSchema }),
  asyncHandler(async (req, res) => {
    sendData(res, await service.createPost(req.user!.id, req.body), undefined, 201);
  })
);

businessRouter.delete(
  "/posts/:id",
  asyncHandler(async (req, res) => {
    sendData(res, await service.deletePost(req.user!.id, param(req, "id")));
  })
);

// ---------- Stats & notifications ----------

businessRouter.get(
  "/stats",
  validate({ query: z.object({ days: z.coerce.number().int().min(7).max(90).default(14) }) }),
  asyncHandler(async (req, res) => {
    const { days } = validQuery<{ days: number }>(req);
    sendData(res, await service.getMyStats(req.user!.id, days));
  })
);

businessRouter.get(
  "/notifications",
  validate({ query: paginationSchema }),
  asyncHandler(async (req, res) => {
    const q = validQuery<{ cursor?: string; limit: number }>(req);
    const [{ items, nextCursor }, unread] = await Promise.all([
      notifications.listNotifications(req.user!.id, q),
      notifications.unreadCount(req.user!.id),
    ]);
    sendData(res, items, { nextCursor, total: unread });
  })
);

businessRouter.post(
  "/notifications/read",
  asyncHandler(async (req, res) => {
    sendData(res, await notifications.markAllRead(req.user!.id));
  })
);
