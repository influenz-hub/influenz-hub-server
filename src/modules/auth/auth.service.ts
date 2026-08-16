import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { env, features } from "../../config/env.js";
import { ApiError } from "../../utils/api-error.js";
import { issueTokenPair, type TokenPair } from "./token.service.js";
import type { RegisterInput, LoginInput } from "./auth.schema.js";
import type { User } from "../../generated/prisma/client.js";

const OTP_TTL_MINUTES = 10;
const EMAIL_TOKEN_TTL_MINUTES = 15;
const BCRYPT_ROUNDS = 12;

/** The user shape returned to clients — never includes credential fields. */
export function toPublicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    image: user.image,
    role: user.role,
    createdAt: user.createdAt,
  };
}

export type AuthResult = TokenPair & { user: ReturnType<typeof toPublicUser> };

async function authResult(user: User): Promise<AuthResult> {
  const tokens = await issueTokenPair(user);
  return { ...tokens, user: toPublicUser(user) };
}

// ---------- Email + password ----------

export async function register(input: RegisterInput): Promise<AuthResult> {
  const email = input.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw ApiError.conflict("An account with that email already exists");

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email,
      passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
      dateOfBirth: input.dateOfBirth ?? null,
    },
  });

  return authResult(user);
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const email = input.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  // Compare against a dummy hash when the user is missing so response time
  // doesn't reveal whether an email is registered.
  const hash = user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali";
  const ok = await bcrypt.compare(input.password, hash);

  if (!user || !user.passwordHash || !ok) {
    throw ApiError.unauthorized("Incorrect email or password");
  }

  return authResult(user);
}

// ---------- Google ----------

function googleClient() {
  if (!features.google) {
    throw ApiError.badRequest("Google sign-in is not configured on this server");
  }
  return new OAuth2Client({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: `${env.API_URL}/api/v1/auth/google/callback`,
  });
}

export function googleAuthUrl(state: string) {
  return googleClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["openid", "email", "profile"],
    state,
  });
}

/** Web flow: exchange the OAuth `code` from the redirect for tokens. */
export async function googleExchangeCode(code: string): Promise<AuthResult> {
  const client = googleClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.id_token) throw ApiError.badRequest("Google did not return an id_token");
  return googleFromIdToken(tokens.id_token);
}

/**
 * Shared by the web callback and the mobile client, which obtains the ID token
 * natively and posts it here.
 */
export async function googleFromIdToken(idToken: string): Promise<AuthResult> {
  const client = googleClient();
  const ticket = await client.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();

  if (!payload?.sub) throw ApiError.unauthorized("Invalid Google token");
  if (!payload.email_verified) throw ApiError.unauthorized("Google account email is not verified");

  const user = await linkOrCreateOAuthUser({
    provider: "google",
    providerAccountId: payload.sub,
    email: payload.email?.toLowerCase() ?? null,
    name: payload.name ?? null,
    image: payload.picture ?? null,
  });

  return authResult(user);
}

async function linkOrCreateOAuthUser(input: {
  provider: string;
  providerAccountId: string;
  email: string | null;
  name: string | null;
  image: string | null;
}): Promise<User> {
  const linked = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: input.provider,
        providerAccountId: input.providerAccountId,
      },
    },
    include: { user: true },
  });
  if (linked) return linked.user;

  // Same verified email as an existing account: link rather than duplicate.
  if (input.email) {
    const byEmail = await prisma.user.findUnique({ where: { email: input.email } });
    if (byEmail) {
      await prisma.oAuthAccount.create({
        data: {
          userId: byEmail.id,
          provider: input.provider,
          providerAccountId: input.providerAccountId,
        },
      });
      return byEmail;
    }
  }

  return prisma.user.create({
    data: {
      email: input.email,
      emailVerified: input.email ? new Date() : null,
      name: input.name,
      image: input.image,
      oauthAccounts: {
        create: { provider: input.provider, providerAccountId: input.providerAccountId },
      },
    },
  });
}

// ---------- Email magic link ----------

function hashToken(token: string) {
  return crypto.createHmac("sha256", env.JWT_REFRESH_PEPPER).update(token).digest("hex");
}

export async function requestEmailLogin(rawEmail: string) {
  const email = rawEmail.toLowerCase();
  const token = crypto.randomBytes(32).toString("base64url");

  await prisma.emailLoginToken.create({
    data: {
      email,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MINUTES * 60 * 1000),
    },
  });

  const link = `${env.WEB_ORIGIN}/verify?token=${token}`;

  if (features.email) {
    const { Resend } = await import("resend");
    const resend = new Resend(env.RESEND_API_KEY);
    await resend.emails.send({
      from: env.EMAIL_FROM,
      to: email,
      subject: "Your Influenz Hub sign-in link",
      html: `<p>Click to sign in to Influenz Hub:</p><p><a href="${link}">${link}</a></p><p>This link expires in ${EMAIL_TOKEN_TTL_MINUTES} minutes.</p>`,
    });
  } else {
    logger.info({ email, link }, "[email-login] RESEND_API_KEY not set — link logged instead of sent");
  }

  // Always the same response, so this endpoint can't enumerate accounts.
  return { sent: true };
}

export async function verifyEmailLogin(token: string): Promise<AuthResult> {
  const record = await prisma.emailLoginToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });

  if (!record || record.consumed || record.expiresAt < new Date()) {
    throw ApiError.unauthorized("That sign-in link is invalid or has expired");
  }

  await prisma.emailLoginToken.update({
    where: { id: record.id },
    data: { consumed: true },
  });

  const user = await prisma.user.upsert({
    where: { email: record.email },
    create: { email: record.email, emailVerified: new Date() },
    update: { emailVerified: new Date() },
  });

  return authResult(user);
}

// ---------- Phone OTP ----------

export async function requestPhoneOtp(phone: string) {
  const code = crypto.randomInt(100000, 1000000).toString();

  await prisma.phoneOtp.create({
    data: {
      phone,
      codeHash: await bcrypt.hash(code, BCRYPT_ROUNDS),
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
    },
  });

  if (features.sms) {
    // TODO: send via Twilio using TWILIO_* env vars.
    logger.warn({ phone }, "[phone-otp] Twilio configured but sending is not implemented yet");
  }
  logger.info({ phone, code }, "[phone-otp] verification code (dev only)");

  return { sent: true };
}

export async function verifyPhoneOtp(phone: string, code: string): Promise<AuthResult> {
  const otp = await prisma.phoneOtp.findFirst({
    where: { phone, consumed: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  if (!otp || !(await bcrypt.compare(code, otp.codeHash))) {
    throw ApiError.unauthorized("Invalid or expired code");
  }

  await prisma.phoneOtp.update({ where: { id: otp.id }, data: { consumed: true } });

  const user = await prisma.user.upsert({
    where: { phone },
    create: { phone, phoneVerified: new Date() },
    update: { phoneVerified: new Date() },
  });

  return authResult(user);
}

// ---------- Current user ----------

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: { select: { id: true, slug: true, businessName: true, logo: true } } },
  });
  if (!user) throw ApiError.notFound("User not found");

  return { ...toPublicUser(user), profile: user.profile };
}
