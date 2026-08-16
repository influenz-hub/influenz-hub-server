import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { validate, validQuery, paginationSchema } from "../../middleware/validate.js";
import { asyncHandler, sendData, param } from "../../utils/http.js";
import * as service from "./admin.service.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole("ADMIN"));

const listQuery = paginationSchema.extend({ q: z.string().max(120).optional() });

adminRouter.get(
  "/overview",
  asyncHandler(async (_req, res) => {
    sendData(res, await service.overview());
  })
);

adminRouter.get(
  "/users",
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const q = validQuery<z.infer<typeof listQuery>>(req);
    const { items, nextCursor } = await service.listUsers(q);
    sendData(res, items, { nextCursor });
  })
);

adminRouter.patch(
  "/users/:id/role",
  validate({ body: z.object({ role: z.enum(["USER", "BUSINESS", "ADMIN"]) }) }),
  asyncHandler(async (req, res) => {
    sendData(res, await service.setUserRole(req.user!.id, param(req, "id"), req.body.role));
  })
);

const businessQuery = listQuery.extend({
  verified: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

adminRouter.get(
  "/businesses",
  validate({ query: businessQuery }),
  asyncHandler(async (req, res) => {
    const q = validQuery<{ q?: string; verified?: boolean; cursor?: string; limit: number }>(req);
    const { items, nextCursor } = await service.listBusinesses(q);
    sendData(res, items, { nextCursor });
  })
);

adminRouter.patch(
  "/businesses/:id/flags",
  validate({
    body: z
      .object({ verified: z.boolean().optional(), featured: z.boolean().optional() })
      .refine((v) => v.verified !== undefined || v.featured !== undefined, {
        message: "Provide at least one of `verified` or `featured`",
      }),
  }),
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    let result;
    if (req.body.verified !== undefined) {
      result = await service.setProfileFlag(id, "verified", req.body.verified);
    }
    if (req.body.featured !== undefined) {
      result = await service.setProfileFlag(id, "featured", req.body.featured);
    }
    sendData(res, result);
  })
);

adminRouter.get(
  "/categories",
  asyncHandler(async (_req, res) => {
    sendData(res, await service.listCategoriesWithUsage());
  })
);

adminRouter.post(
  "/categories",
  validate({ body: z.object({ name: z.string().min(2).max(40), icon: z.string().max(40).optional() }) }),
  asyncHandler(async (req, res) => {
    sendData(res, await service.createCategory(req.body.name, req.body.icon), undefined, 201);
  })
);

adminRouter.delete(
  "/categories/:id",
  asyncHandler(async (req, res) => {
    sendData(res, await service.deleteCategory(param(req, "id")));
  })
);

const reportQuery = paginationSchema.extend({
  status: z.enum(["OPEN", "RESOLVED", "DISMISSED"]).optional(),
});

adminRouter.get(
  "/reports",
  validate({ query: reportQuery }),
  asyncHandler(async (req, res) => {
    const q = validQuery<z.infer<typeof reportQuery>>(req);
    const { items, nextCursor } = await service.listReports(q);
    sendData(res, items, { nextCursor });
  })
);

adminRouter.patch(
  "/reports/:id",
  validate({ body: z.object({ status: z.enum(["OPEN", "RESOLVED", "DISMISSED"]) }) }),
  asyncHandler(async (req, res) => {
    sendData(res, await service.updateReportStatus(param(req, "id"), req.body.status));
  })
);

// ---------- Reporting is available to any signed-in user ----------

export const reportsRouter = Router();

reportsRouter.post(
  "/",
  requireAuth,
  validate({
    body: z.object({
      targetType: z.enum(["PROFILE", "STORE", "PRODUCT", "SERVICE", "POST"]),
      targetId: z.string().min(1),
      reason: z.string().min(5).max(1000),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { targetType, targetId, reason } = req.body;
    sendData(res, await service.createReport(req.user!.id, targetType, targetId, reason), undefined, 201);
  })
);
