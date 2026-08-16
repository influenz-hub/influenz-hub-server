import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/api-error.js";
import { verifyAccessToken } from "../modules/auth/token.service.js";
import type { Role } from "../generated/prisma/client.js";

function readBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

/** Rejects the request unless a valid access token is present. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = readBearer(req);
  if (!token) return next(ApiError.unauthorized());

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(ApiError.unauthorized("Invalid or expired access token"));
  }
}

/**
 * Attaches the user when a valid token is present but never rejects — used by
 * public endpoints that personalize their response (e.g. "did I like this?").
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = readBearer(req);
  if (!token) return next();

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
  } catch {
    // An invalid token on a public route is simply treated as anonymous.
  }
  next();
}

/** Must run after requireAuth. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
    next();
  };
}
