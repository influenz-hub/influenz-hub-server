import crypto from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler, sendData } from "../../utils/http.js";
import { ApiError } from "../../utils/api-error.js";
import { env } from "../../config/env.js";
import * as authService from "./auth.service.js";
import { rotateRefreshToken, revokeRefreshToken } from "./token.service.js";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  emailRequestSchema,
  emailVerifySchema,
  phoneRequestSchema,
  phoneVerifySchema,
  googleTokenSchema,
} from "./auth.schema.js";

export const authRouter = Router();

/** Auth endpoints get a much tighter budget than the global limiter. */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: { code: "TOO_MANY_REQUESTS", message: "Too many attempts, try again later" } },
});

authRouter.use(authLimiter);

authRouter.post(
  "/register",
  validate({ body: registerSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.register(req.body);
    sendData(res, result, undefined, 201);
  })
);

authRouter.post(
  "/login",
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    sendData(res, await authService.login(req.body));
  })
);

authRouter.post(
  "/refresh",
  validate({ body: refreshSchema }),
  asyncHandler(async (req, res) => {
    sendData(res, await rotateRefreshToken(req.body.refreshToken));
  })
);

authRouter.post(
  "/logout",
  validate({ body: refreshSchema }),
  asyncHandler(async (req, res) => {
    await revokeRefreshToken(req.body.refreshToken);
    sendData(res, { success: true });
  })
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    sendData(res, await authService.getMe(req.user!.id));
  })
);

// ---------- Google ----------

/**
 * Web flow. `state` is a signed nonce echoed back by Google and checked in the
 * callback to prevent CSRF on the OAuth exchange.
 */
authRouter.get(
  "/google",
  asyncHandler(async (req, res) => {
    const state = crypto.randomBytes(16).toString("hex");
    res.cookie("oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      maxAge: 10 * 60 * 1000,
    });
    res.redirect(authService.googleAuthUrl(state));
  })
);

authRouter.get(
  "/google/callback",
  asyncHandler(async (req, res) => {
    const { code, state } = req.query as { code?: string; state?: string };
    const expected = req.cookies?.oauth_state as string | undefined;

    if (!code) throw ApiError.badRequest("Missing authorization code");
    if (!state || !expected || state !== expected) {
      throw ApiError.badRequest("Invalid OAuth state");
    }

    res.clearCookie("oauth_state");
    const result = await authService.googleExchangeCode(code);

    // Hand the refresh token to the web app's callback route, which converts it
    // into an httpOnly session cookie. Access tokens stay out of the URL.
    const redirect = new URL("/auth/callback", env.WEB_ORIGIN);
    redirect.searchParams.set("refreshToken", result.refreshToken);
    res.redirect(redirect.toString());
  })
);

/** Mobile flow: native Google Sign-In yields an ID token, posted here. */
authRouter.post(
  "/google/token",
  validate({ body: googleTokenSchema }),
  asyncHandler(async (req, res) => {
    sendData(res, await authService.googleFromIdToken(req.body.idToken));
  })
);

// ---------- Email magic link ----------

authRouter.post(
  "/email/request",
  validate({ body: emailRequestSchema }),
  asyncHandler(async (req, res) => {
    sendData(res, await authService.requestEmailLogin(req.body.email));
  })
);

authRouter.post(
  "/email/verify",
  validate({ body: emailVerifySchema }),
  asyncHandler(async (req, res) => {
    sendData(res, await authService.verifyEmailLogin(req.body.token));
  })
);

// ---------- Phone OTP ----------

authRouter.post(
  "/phone/request",
  validate({ body: phoneRequestSchema }),
  asyncHandler(async (req, res) => {
    sendData(res, await authService.requestPhoneOtp(req.body.phone));
  })
);

authRouter.post(
  "/phone/verify",
  validate({ body: phoneVerifySchema }),
  asyncHandler(async (req, res) => {
    sendData(res, await authService.verifyPhoneOtp(req.body.phone, req.body.code));
  })
);
