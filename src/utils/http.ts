import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Express 5 forwards rejected promises to the error handler, but wrapping keeps
 * the intent explicit and stays correct if a handler is ever called directly.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    void fn(req, res, next).catch(next);
  };
}

/**
 * Express 5 types route params as `string | string[]` because a pattern can
 * repeat. Our routes never do, so this narrows to the single value.
 */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export type Meta = { nextCursor?: string | null; total?: number };

export function sendData<T>(res: Response, data: T, meta?: Meta, status = 200) {
  return res.status(status).json(meta ? { data, meta } : { data });
}

/** Cursor pagination: fetch `limit + 1` rows, then trim to detect a next page. */
export function paginate<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? (items.at(-1)?.id ?? null) : null;
  return { items, nextCursor };
}

/** Prisma cursor args for a list query, given an optional cursor id. */
export function cursorArgs(cursor: string | undefined, limit: number) {
  return {
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  };
}
