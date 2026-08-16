import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ApiError } from "../utils/api-error.js";
import { isProd } from "../config/env.js";
import { logger } from "../lib/logger.js";

export function notFound(_req: Request, res: Response) {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: "Route not found" },
  });
}

/**
 * Single place where any thrown error becomes a response. Everything that isn't
 * a recognized, expected failure is logged and reported as a generic 500 — we
 * never leak internal messages or stack traces to clients in production.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: err.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
    });
  }

  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }

  // Prisma's unique-constraint violation is common enough to map explicitly.
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "P2002"
  ) {
    return res.status(409).json({
      error: { code: "CONFLICT", message: "That value is already taken" },
    });
  }

  logger.error({ err, path: req.path, method: req.method }, "Unhandled error");

  return res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: isProd
        ? "Something went wrong"
        : err instanceof Error
          ? err.message
          : "Unknown error",
    },
  });
}
