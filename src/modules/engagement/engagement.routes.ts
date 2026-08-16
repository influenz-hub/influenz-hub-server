import { Router } from "express";
import { z } from "zod";
import { requireAuth, optionalAuth } from "../../middleware/auth.js";
import { validate, validQuery, paginationSchema, type Pagination } from "../../middleware/validate.js";
import { asyncHandler, sendData, param } from "../../utils/http.js";
import * as service from "./engagement.service.js";

export const engagementRouter = Router();

const targetSchema = z.object({
  targetType: z.enum(["PROFILE", "STORE", "PRODUCT", "SERVICE", "POST"]),
  targetId: z.string().min(1),
});

const targetQuery = targetSchema.merge(paginationSchema);

engagementRouter.post(
  "/likes",
  requireAuth,
  validate({ body: targetSchema.extend({ liked: z.boolean() }) }),
  asyncHandler(async (req, res) => {
    const { targetType, targetId, liked } = req.body;
    sendData(res, await service.setLike(req.user!.id, targetType, targetId, liked));
  })
);

engagementRouter.post(
  "/follows",
  requireAuth,
  validate({ body: targetSchema.extend({ following: z.boolean() }) }),
  asyncHandler(async (req, res) => {
    const { targetType, targetId, following } = req.body;
    sendData(res, await service.setFollow(req.user!.id, targetType, targetId, following));
  })
);

engagementRouter.get(
  "/comments",
  validate({ query: targetQuery }),
  asyncHandler(async (req, res) => {
    const q = validQuery<z.infer<typeof targetQuery>>(req);
    const { items, nextCursor } = await service.listComments(q.targetType, q.targetId, q);
    sendData(res, items, { nextCursor });
  })
);

engagementRouter.post(
  "/comments",
  requireAuth,
  validate({ body: targetSchema.extend({ text: z.string().min(1).max(500) }) }),
  asyncHandler(async (req, res) => {
    const { targetType, targetId, text } = req.body;
    sendData(res, await service.addComment(req.user!.id, targetType, targetId, text), undefined, 201);
  })
);

engagementRouter.delete(
  "/comments/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    sendData(res, await service.deleteComment(req.user!.id, param(req, "id")));
  })
);

engagementRouter.get(
  "/reviews",
  validate({ query: targetQuery }),
  asyncHandler(async (req, res) => {
    const q = validQuery<z.infer<typeof targetQuery>>(req);
    const { items, nextCursor, rating } = await service.listReviews(q.targetType, q.targetId, q);
    sendData(res, { reviews: items, rating }, { nextCursor });
  })
);

engagementRouter.put(
  "/reviews",
  requireAuth,
  validate({
    body: targetSchema.extend({
      rating: z.coerce.number().int().min(1).max(5),
      text: z.string().max(1000).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { targetType, targetId, rating, text } = req.body;
    sendData(res, await service.upsertReview(req.user!.id, targetType, targetId, rating, text));
  })
);

engagementRouter.post(
  "/views",
  optionalAuth,
  validate({ body: targetSchema }),
  asyncHandler(async (req, res) => {
    const { targetType, targetId } = req.body;
    sendData(res, await service.recordView(targetType, targetId, req.user?.id));
  })
);

export type { Pagination };
