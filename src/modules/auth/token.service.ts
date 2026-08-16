import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { ApiError } from "../../utils/api-error.js";
import type { Role, User } from "../../generated/prisma/client.js";

export type AccessPayload = { sub: string; role: Role };

export function signAccessToken(user: { id: string; role: Role }) {
  return jwt.sign({ role: user.role }, env.JWT_ACCESS_SECRET, {
    subject: user.id,
    expiresIn: env.ACCESS_TOKEN_TTL,
    issuer: "influenz-hub",
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: "influenz-hub",
  }) as jwt.JwtPayload;

  if (!decoded.sub || typeof decoded.role !== "string") {
    throw new Error("Malformed access token");
  }
  return { sub: decoded.sub, role: decoded.role as Role };
}

/**
 * Refresh tokens are opaque random strings. Only a keyed hash is stored, so a
 * database leak alone can't be replayed against the API.
 */
function hashRefreshToken(token: string) {
  return crypto.createHmac("sha256", env.JWT_REFRESH_PEPPER).update(token).digest("hex");
}

function refreshExpiry() {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

async function createRefreshToken(userId: string, familyId: string) {
  const token = crypto.randomBytes(48).toString("base64url");
  await prisma.refreshToken.create({
    data: {
      userId,
      familyId,
      tokenHash: hashRefreshToken(token),
      expiresAt: refreshExpiry(),
    },
  });
  return token;
}

export type TokenPair = { accessToken: string; refreshToken: string; expiresIn: number };

/** Starts a new session (new token family). */
export async function issueTokenPair(user: Pick<User, "id" | "role">): Promise<TokenPair> {
  const familyId = crypto.randomUUID();
  const refreshToken = await createRefreshToken(user.id, familyId);
  return {
    accessToken: signAccessToken(user),
    refreshToken,
    expiresIn: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
  };
}

/**
 * Rotates a refresh token: the presented token is consumed and a fresh one is
 * issued within the same family.
 *
 * If a token that was already consumed is presented again, that's a strong
 * signal it was stolen and replayed — so the entire family is revoked, forcing
 * both the attacker and the legitimate user to re-authenticate.
 */
export async function rotateRefreshToken(presented: string): Promise<TokenPair> {
  const tokenHash = hashRefreshToken(presented);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!existing) throw ApiError.unauthorized("Invalid refresh token");

  if (existing.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { familyId: existing.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw ApiError.unauthorized("Refresh token reuse detected — please sign in again");
  }

  if (existing.expiresAt < new Date()) {
    throw ApiError.unauthorized("Refresh token expired");
  }

  const [, refreshToken] = await Promise.all([
    prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    }),
    createRefreshToken(existing.userId, existing.familyId),
  ]);

  return {
    accessToken: signAccessToken(existing.user),
    refreshToken,
    expiresIn: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
  };
}

/** Revokes just the presented token's family (single-session logout). */
export async function revokeRefreshToken(presented: string) {
  const tokenHash = hashRefreshToken(presented);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!existing) return;

  await prisma.refreshToken.updateMany({
    where: { familyId: existing.familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Housekeeping for the nightly job. */
export async function purgeExpiredRefreshTokens() {
  const { count } = await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}
