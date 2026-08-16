import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  dateOfBirth: z.coerce.date().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const emailRequestSchema = z.object({
  email: z.string().email(),
});

export const emailVerifySchema = z.object({
  token: z.string().min(1),
});

export const phoneRequestSchema = z.object({
  phone: z.string().min(6).max(30),
});

export const phoneVerifySchema = z.object({
  phone: z.string().min(6).max(30),
  code: z.string().length(6),
});

export const googleTokenSchema = z.object({
  idToken: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
