import { z } from "zod";

const optionalUrl = z.union([z.string().url(), z.literal("")]).optional();
const images = z.array(z.string().url()).max(8).default([]);

export const profileSchema = z.object({
  businessName: z.string().min(2).max(80),
  description: z.string().max(2000).optional(),
  categoryId: z.string().optional(),
  location: z.string().max(120).optional(),
  contactEmail: z.union([z.string().email(), z.literal("")]).optional(),
  contactPhone: z.string().max(30).optional(),
  logo: optionalUrl,
  banner: optionalUrl,
  socialLinks: z.record(z.string(), z.string().url()).optional(),
});

export const storeSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(2000).optional(),
  categoryId: z.string().optional(),
  location: z.string().max(120).optional(),
  contactInfo: z.string().max(200).optional(),
  openingHours: z.record(z.string(), z.string()).optional(),
  images,
});

/**
 * Prices are in XOF (West African CFA franc), which has no subunit in
 * circulation — so amounts are whole numbers, not decimals.
 *
 * The ceiling is well under the `Decimal(10,2)` column limit while still
 * allowing high-value listings (50,000,000 XOF is roughly USD 80,000).
 */
const MAX_PRICE = 50_000_000;
const price = z.coerce.number().int("Price must be a whole number").min(0).max(MAX_PRICE);

export const productSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  categoryId: z.string().optional(),
  price,
  stock: z.coerce.number().int().min(0).default(0),
  available: z.coerce.boolean().default(true),
  images,
});

export const serviceSchema = z
  .object({
    name: z.string().min(2).max(120),
    description: z.string().max(2000).optional(),
    categoryId: z.string().optional(),
    priceMin: price.optional(),
    priceMax: price.optional(),
    contactMethod: z.string().max(200).optional(),
    images,
  })
  .refine((v) => v.priceMin == null || v.priceMax == null || v.priceMax >= v.priceMin, {
    message: "Maximum price must be greater than or equal to the minimum",
    path: ["priceMax"],
  });

export const postSchema = z.object({
  text: z.string().min(1).max(2000),
  images,
  storeId: z.string().optional(),
  productId: z.string().optional(),
});
