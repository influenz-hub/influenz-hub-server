import "dotenv/config";
import { z } from "zod";

/**
 * Environment is validated once at boot. A misconfigured deploy should fail
 * loudly here rather than surfacing as a confusing runtime error later.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  API_URL: z.string().url().default("http://localhost:4000"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_PEPPER: z.string().min(32, "JWT_REFRESH_PEPPER must be at least 32 characters"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),

  RESEND_API_KEY: z.string().default(""),
  EMAIL_FROM: z.string().default("Influenz Hub <onboarding@resend.dev>"),

  TWILIO_ACCOUNT_SID: z.string().default(""),
  TWILIO_AUTH_TOKEN: z.string().default(""),
  TWILIO_PHONE_NUMBER: z.string().default(""),

  ENABLE_CRON: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;

export const isProd = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

/** Feature availability, derived rather than checked ad hoc at call sites. */
export const features = {
  google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  email: Boolean(env.RESEND_API_KEY),
  sms: Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PHONE_NUMBER),
};
