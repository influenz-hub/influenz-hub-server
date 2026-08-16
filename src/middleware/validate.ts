import type { NextFunction, Request, Response } from "express";
import { z, type ZodType } from "zod";

type Schemas = {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
};

/**
 * Validates and *replaces* the request parts with their parsed output, so
 * downstream handlers receive coerced, typed values rather than raw strings.
 * Parsed query/params are stashed on `req.valid` because Express 5 makes
 * `req.query` a getter that can't be reassigned.
 */
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) req.valid = { ...req.valid, query: schemas.query.parse(req.query) };
      if (schemas.params) req.valid = { ...req.valid, params: schemas.params.parse(req.params) };
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Typed accessors so controllers don't repeat casts. */
export function validQuery<T>(req: Request): T {
  return req.valid?.query as T;
}

export function validParams<T>(req: Request): T {
  return (req.valid?.params ?? req.params) as T;
}

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;
